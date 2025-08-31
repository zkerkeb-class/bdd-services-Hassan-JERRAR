import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import logger from "../utils/logger";
import { AuthRequest } from "../interfaces/auth.interface";

// Interface pour les métriques de requête
interface RequestMetrics {
    requestId: string;
    method: string;
    url: string;
    userAgent?: string;
    ip: string;
    userId?: string;
    companyId?: string;
    startTime: number;
    endTime?: number;
    duration?: number;
    statusCode?: number;
    contentLength?: number;
    errorMessage?: string;
}

// Middleware de logging des requêtes HTTP
export const requestLogger = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    const requestId = uuidv4();
    const startTime = Date.now();

    // Ajouter l'ID de requête aux locals pour utilisation dans les réponses
    res.locals.requestId = requestId;

    // Créer les métriques de base
    const metrics: RequestMetrics = {
        requestId,
        method: req.method,
        url: req.url,
        userAgent: req.get("User-Agent"),
        ip: req.ip || req.connection.remoteAddress || "unknown",
        startTime,
    };

    // Log de début de requête
    logger.info(metrics, "Requête reçue");

    // Capture de la méthode originale res.end
    const originalEnd = res.end;
    const originalJson = res.json;

    // Override de res.end pour capturer la fin de la requête
    res.end = function (chunk?: any, encoding?: any): void {
        const endTime = Date.now();
        const duration = endTime - startTime;

        // Mise à jour des métriques
        metrics.endTime = endTime;
        metrics.duration = duration;
        metrics.statusCode = res.statusCode;
        metrics.contentLength = parseInt(res.get("Content-Length") || "0", 10);

        // Ajouter les informations utilisateur si disponibles
        if (req.user) {
            metrics.userId = req.user.id;
            metrics.companyId = req.user.company_id;
        }

        // Log de fin de requête avec niveau approprié
        if (res.statusCode >= 500) {
            logger.error(metrics, "Requête terminée avec erreur serveur");
        } else if (res.statusCode >= 400) {
            logger.warn(metrics, "Requête terminée avec erreur client");
        } else {
            logger.info(metrics, "Requête terminée avec succès");
        }

        // Métriques de performance
        if (duration > 5000) {
            // Plus de 5 secondes
            logger.warn({ ...metrics, slow: true }, "Requête lente détectée");
        }

        // Appeler la méthode originale
        originalEnd.call(this, chunk, encoding);
    };

    // Override de res.json pour capturer les erreurs dans les réponses JSON
    res.json = function (body?: any): Response {
        if (body && !body.success && body.error) {
            metrics.errorMessage = body.error;
        }
        return originalJson.call(this, body);
    };

    next();
};

// Middleware de logging détaillé pour le développement
export const detailedLogger = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    if (process.env.NODE_ENV !== "development") {
        return next();
    }

    const requestDetails = {
        headers: req.headers,
        query: req.query,
        params: req.params,
        body: sanitizeRequestBody(req.body),
        cookies: req.cookies,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString(),
    };

    logger.debug(requestDetails, "Détails de la requête (dev)");
    next();
};

// Middleware pour mesurer les performances par endpoint
export const performanceLogger = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const startTime = process.hrtime.bigint();

    res.on("finish", () => {
        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - startTime) / 1000000; // Convert to milliseconds

        const performanceMetrics = {
            endpoint: `${req.method} ${req.route?.path || req.path}`,
            duration,
            statusCode: res.statusCode,
            timestamp: new Date().toISOString(),
        };

        // Log des performances critiques
        if (duration > 2000) {
            // Plus de 2 secondes
            logger.warn(performanceMetrics, "Endpoint lent détecté");
        } else if (duration > 1000) {
            // Plus de 1 seconde
            logger.info(performanceMetrics, "Endpoint modérément lent");
        } else {
            logger.debug(performanceMetrics, "Performance endpoint");
        }
    });

    next();
};

// Middleware de logging des erreurs de validation
export const validationLogger = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    const originalJson = res.json;

    res.json = function (body?: any): Response {
        if (body && !body.success && body.errors) {
            const validationLog = {
                requestId: res.locals.requestId,
                userId: req.user?.id,
                endpoint: `${req.method} ${req.path}`,
                validationErrors: body.errors,
                requestBody: sanitizeRequestBody(req.body),
                timestamp: new Date().toISOString(),
            };

            logger.warn(validationLog, "Erreurs de validation détectées");
        }

        return originalJson.call(this, body);
    };

    next();
};

// Middleware de logging de l'activité utilisateur
export const userActivityLogger = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user) {
        return next();
    }

    res.on("finish", () => {
        // Log uniquement les actions de modification (POST, PUT, PATCH, DELETE)
        if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
            const activityLog = {
                userId: req.user!.id,
                userEmail: req.user!.email,
                companyId: req.user!.company_id,
                action: req.method,
                resource: req.path,
                statusCode: res.statusCode,
                ip: req.ip,
                userAgent: req.get("User-Agent"),
                timestamp: new Date().toISOString(),
            };

            logger.info(activityLog, "Activité utilisateur");
        }
    });

    next();
};

// Middleware de logging des accès par entreprise
export const companyAccessLogger = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    if (!req.user?.company_id) {
        return next();
    }

    res.on("finish", () => {
        const accessLog = {
            companyId: req.user!.company_id,
            userId: req.user!.id,
            endpoint: `${req.method} ${req.path}`,
            statusCode: res.statusCode,
            duration: res.locals.duration,
            timestamp: new Date().toISOString(),
        };

        logger.debug(accessLog, "Accès entreprise");
    });

    next();
};

// Middleware de logging de sécurité
export const securityLogger = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    // Log des tentatives d'accès non autorisées
    res.on("finish", () => {
        if (res.statusCode === 401 || res.statusCode === 403) {
            const securityLog = {
                ip: req.ip,
                userAgent: req.get("User-Agent"),
                endpoint: `${req.method} ${req.path}`,
                statusCode: res.statusCode,
                userId: req.user?.id,
                authHeader: req.headers.authorization ? "present" : "missing",
                timestamp: new Date().toISOString(),
            };

            logger.warn(securityLog, "Tentative d'accès non autorisée");
        }
    });

    next();
};

// Fonction utilitaire pour nettoyer le body des données sensibles
function sanitizeRequestBody(body: any): any {
    if (!body || typeof body !== "object") {
        return body;
    }

    const sensitiveFields = [
        "password",
        "token",
        "secret",
        "key",
        "authorization",
    ];
    const sanitized = { ...body };

    sensitiveFields.forEach((field) => {
        if (sanitized[field]) {
            sanitized[field] = "***REDACTED***";
        }
    });

    return sanitized;
}

// Middleware de logging conditionnel basé sur l'environnement
export const conditionalLogger = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const isDevelopment = process.env.NODE_ENV === "development";
    const isProduction = process.env.NODE_ENV === "production";

    // En développement, log tout
    if (isDevelopment) {
        return detailedLogger(req as AuthRequest, res, next);
    }

    // En production, log seulement les erreurs et activités importantes
    if (isProduction) {
        return requestLogger(req as AuthRequest, res, next);
    }

    // Par défaut, log minimal
    next();
};

// Exporter tous les middlewares
export default {
    requestLogger,
    detailedLogger,
    performanceLogger,
    validationLogger,
    userActivityLogger,
    companyAccessLogger,
    securityLogger,
    conditionalLogger,
};
