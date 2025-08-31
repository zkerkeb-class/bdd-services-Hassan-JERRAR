import { Request, Response, NextFunction } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import logger from "../utils/logger";
import ApiResponse from "../utils/apiResponse";
import { CustomError, isOperationalError } from "../utils/customError";

// Interface pour les erreurs avec contexte
interface ErrorWithContext extends Error {
    statusCode?: number;
    code?: string;
    details?: any;
    isOperational?: boolean;
}

// Middleware de gestion d'erreurs global
export const errorHandler = (
    error: ErrorWithContext,
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    // Log de l'erreur avec contexte
    const errorContext = {
        message: error.message,
        stack: error.stack,
        statusCode: error.statusCode,
        code: error.code,
        details: error.details,
        url: req.url,
        method: req.method,
        userAgent: req.get("User-Agent"),
        ip: req.ip,
        userId: (req as any).user?.id,
        companyId: (req as any).user?.company_id,
        timestamp: new Date().toISOString(),
    };

    // Log différent selon le type d'erreur
    if (error.statusCode && error.statusCode < 500) {
        logger.warn(errorContext, "Erreur client");
    } else {
        logger.error(errorContext, "Erreur serveur");
    }

    // Gestion des erreurs personnalisées
    if (error instanceof CustomError) {
        return ApiResponse.error(
            res,
            error.message,
            error.statusCode,
            error.code,
            error.details
        );
    }

    // Gestion des erreurs Prisma
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
        const prismaError = handlePrismaError(error);
        return ApiResponse.error(
            res,
            prismaError.message,
            prismaError.statusCode,
            prismaError.code,
            prismaError.details
        );
    }

    // Gestion des erreurs de validation Prisma
    if (error instanceof Prisma.PrismaClientValidationError) {
        return ApiResponse.error(
            res,
            "Erreur de validation des données",
            400,
            "VALIDATION_ERROR",
            { originalError: error.message }
        );
    }

    // Gestion des erreurs de connexion Prisma
    if (error instanceof Prisma.PrismaClientInitializationError) {
        return ApiResponse.error(
            res,
            "Erreur de connexion à la base de données",
            503,
            "DATABASE_CONNECTION_ERROR"
        );
    }

    // Gestion des erreurs Zod (validation)
    if (error instanceof ZodError) {
        const zodError = handleZodError(error);
        return ApiResponse.validation(res, zodError.errors, zodError.message);
    }

    // Gestion des erreurs JWT
    if (error.name === "JsonWebTokenError") {
        return ApiResponse.unauthorized(res, "Token JWT invalide");
    }

    if (error.name === "TokenExpiredError") {
        return ApiResponse.unauthorized(res, "Token JWT expiré");
    }

    // Gestion des erreurs de syntaxe JSON
    if (error instanceof SyntaxError && "body" in error) {
        return ApiResponse.error(
            res,
            "Format JSON invalide",
            400,
            "JSON_SYNTAX_ERROR"
        );
    }

    // Gestion des erreurs de type (casting)
    if (error.name === "CastError") {
        return ApiResponse.error(
            res,
            "Format de données invalide",
            400,
            "CAST_ERROR",
            { field: (error as any).path, value: (error as any).value }
        );
    }

    // Erreurs de validation MongoDB (si utilisé)
    if (error.name === "ValidationError") {
        const validationErrors = Object.values((error as any).errors).map(
            (err: any) => ({
                field: err.path,
                message: err.message,
                value: err.value,
            })
        );

        return ApiResponse.validation(
            res,
            { errors: validationErrors },
            "Erreurs de validation"
        );
    }

    // Erreurs de duplication (code 11000 pour MongoDB)
    if ((error as any).code === 11000) {
        const field = Object.keys((error as any).keyValue)[0];
        const value = (error as any).keyValue[field];

        return ApiResponse.conflict(
            res,
            `Une entrée avec ${field} '${value}' existe déjà`
        );
    }

    // Gestion des erreurs opérationnelles vs programmation
    if (isOperationalError(error)) {
        return ApiResponse.error(
            res,
            error.message,
            error.statusCode || 500,
            error.code,
            error.details
        );
    }

    // Erreur par défaut (erreur de programmation)
    const isDevelopment = process.env.NODE_ENV === "development";

    return ApiResponse.error(
        res,
        isDevelopment ? error.message : "Erreur interne du serveur",
        500,
        "INTERNAL_ERROR",
        isDevelopment ? { stack: error.stack } : undefined
    );
};

// Gestionnaire d'erreurs Prisma spécifique
function handlePrismaError(error: Prisma.PrismaClientKnownRequestError) {
    switch (error.code) {
        case "P2000":
            return {
                message: "La valeur fournie est trop longue pour le champ",
                statusCode: 400,
                code: "VALUE_TOO_LONG",
                details: { target: error.meta?.target },
            };

        case "P2001":
            return {
                message: "L'enregistrement recherché n'existe pas",
                statusCode: 404,
                code: "RECORD_NOT_FOUND",
                details: { target: error.meta?.cause },
            };

        case "P2002":
            const target = Array.isArray(error.meta?.target)
                ? error.meta.target.join(", ")
                : error.meta?.target;
            return {
                message: `Une entrée avec ces ${target} existe déjà`,
                statusCode: 409,
                code: "UNIQUE_CONSTRAINT",
                details: { field: target },
            };

        case "P2003":
            return {
                message: "Violation de contrainte de clé étrangère",
                statusCode: 400,
                code: "FOREIGN_KEY_CONSTRAINT",
                details: { field: error.meta?.field_name },
            };

        case "P2004":
            return {
                message: "Violation de contrainte de base de données",
                statusCode: 400,
                code: "CONSTRAINT_VIOLATION",
                details: { constraint: error.meta?.constraint },
            };

        case "P2005":
            return {
                message: "Valeur invalide pour le type de champ",
                statusCode: 400,
                code: "INVALID_FIELD_VALUE",
                details: {
                    field: error.meta?.field_name,
                    value: error.meta?.field_value,
                },
            };

        case "P2006":
            return {
                message: "Valeur fournie invalide",
                statusCode: 400,
                code: "INVALID_VALUE",
                details: { field: error.meta?.field_name },
            };

        case "P2007":
            return {
                message: "Erreur de validation des données",
                statusCode: 400,
                code: "DATA_VALIDATION_ERROR",
                details: { target: error.meta?.target },
            };

        case "P2008":
            return {
                message: "Échec de l'analyse de la requête",
                statusCode: 400,
                code: "QUERY_PARSE_ERROR",
                details: { query: error.meta?.query_parsing_error },
            };

        case "P2009":
            return {
                message: "Échec de la validation de la requête",
                statusCode: 400,
                code: "QUERY_VALIDATION_ERROR",
                details: { query: error.meta?.query_validation_error },
            };

        case "P2010":
            return {
                message: "Échec d'exécution de la requête brute",
                statusCode: 400,
                code: "RAW_QUERY_ERROR",
                details: {
                    code: error.meta?.code,
                    message: error.meta?.message,
                },
            };

        case "P2011":
            return {
                message: "Violation de contrainte NULL",
                statusCode: 400,
                code: "NULL_CONSTRAINT",
                details: { constraint: error.meta?.constraint },
            };

        case "P2012":
            return {
                message: "Valeur manquante requise",
                statusCode: 400,
                code: "MISSING_REQUIRED_VALUE",
                details: { path: error.meta?.path },
            };

        case "P2013":
            return {
                message: "Argument requis manquant",
                statusCode: 400,
                code: "MISSING_REQUIRED_ARGUMENT",
                details: {
                    argument: error.meta?.argument_name,
                    field: error.meta?.field_name,
                },
            };

        case "P2014":
            return {
                message: "Relation requise manquante",
                statusCode: 400,
                code: "REQUIRED_RELATION_VIOLATION",
                details: {
                    relation: error.meta?.relation_name,
                    model: error.meta?.model_name,
                },
            };

        case "P2015":
            return {
                message: "Enregistrement associé non trouvé",
                statusCode: 404,
                code: "RELATED_RECORD_NOT_FOUND",
                details: { target: error.meta?.target },
            };

        case "P2016":
            return {
                message: "Erreur d'interprétation de la requête",
                statusCode: 400,
                code: "QUERY_INTERPRETATION_ERROR",
                details: { details: error.meta?.details },
            };

        case "P2017":
            return {
                message: "Relations non connectées",
                statusCode: 400,
                code: "RECORDS_NOT_CONNECTED",
                details: { relation: error.meta?.relation_name },
            };

        case "P2018":
            return {
                message: "Enregistrements connectés requis non trouvés",
                statusCode: 404,
                code: "CONNECTED_RECORDS_NOT_FOUND",
                details: { target: error.meta?.target },
            };

        case "P2025":
            return {
                message: "Enregistrement à supprimer non trouvé",
                statusCode: 404,
                code: "RECORD_TO_DELETE_NOT_FOUND",
                details: { target: error.meta?.cause },
            };

        default:
            return {
                message: "Erreur de base de données",
                statusCode: 500,
                code: "DATABASE_ERROR",
                details: { prismaCode: error.code, meta: error.meta },
            };
    }
}

// Gestionnaire d'erreurs Zod spécifique
function handleZodError(error: ZodError) {
    const errors: Record<string, any> = {};

    error.errors.forEach((err) => {
        const path = err.path.join(".");
        errors[path] = {
            message: err.message,
            code: err.code,
            expected: (err as any).expected,
            received: (err as any).received,
        };
    });

    return {
        message: "Erreurs de validation des données",
        errors,
    };
}

// Middleware pour capturer les erreurs async non gérées
export const asyncHandler = (fn: Function) => {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};

// Middleware pour les routes non trouvées
export const notFoundHandler = (req: Request, res: Response): void => {
    ApiResponse.notFound(res, `Route ${req.method} ${req.path} non trouvée`);
};

// Gestionnaire d'erreurs non capturées
export const uncaughtErrorHandler = () => {
    process.on("uncaughtException", (error: Error) => {
        logger.fatal({ error }, "Exception non capturée");
        process.exit(1);
    });

    process.on(
        "unhandledRejection",
        (reason: unknown, promise: Promise<unknown>) => {
            logger.fatal({ reason, promise }, "Promesse rejetée non gérée");
            process.exit(1);
        }
    );
};

export default {
    errorHandler,
    asyncHandler,
    notFoundHandler,
    uncaughtErrorHandler,
};
