import { Request, Response, NextFunction } from "express";
import authService from "../lib/supabase";
import ApiResponse from "../utils/apiResponse";
import { AuthRequest, IUser } from "../interfaces/auth.interface";
import {
    UnauthorizedError,
    ForbiddenError,
    PermissionError,
} from "../utils/customError";
import logger from "../utils/logger";

// Middleware d'authentification principal
export const authenticate = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            throw new UnauthorizedError("Token d'authentification requis");
        }

        if (!authHeader.startsWith("Bearer ")) {
            throw new UnauthorizedError("Format de token invalide");
        }

        const token = authHeader.substring(7);

        if (!token) {
            throw new UnauthorizedError("Token manquant");
        }

        // Vérifier le token avec Supabase
        const user = await authService.verifyToken(token);

        if (!user) {
            throw new UnauthorizedError("Token invalide ou expiré");
        }

        if (!user.is_active) {
            throw new ForbiddenError("Compte utilisateur inactif");
        }

        // Mettre à jour la dernière connexion
        await authService.updateLastLogin(user.id);

        // Ajouter l'utilisateur à la requête
        req.user = user;

        logger.debug(
            {
                userId: user.id,
                email: user.email,
                role: user.role,
                path: req.path,
                method: req.method,
            },
            "Authentification réussie"
        );

        next();
    } catch (error) {
        logger.warn(
            {
                error: error.message,
                path: req.path,
                method: req.method,
                ip: req.ip,
            },
            "Échec d'authentification"
        );

        if (
            error instanceof UnauthorizedError ||
            error instanceof ForbiddenError
        ) {
            next(error);
        } else {
            next(new UnauthorizedError("Erreur d'authentification"));
        }
    }
};

// Middleware d'authentification optionnelle (pour les endpoints publics avec info utilisateur optionnelle)
export const optionalAuth = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith("Bearer ")) {
            const token = authHeader.substring(7);

            if (token) {
                const user = await authService.verifyToken(token);
                if (user && user.is_active) {
                    req.user = user;
                    await authService.updateLastLogin(user.id);
                }
            }
        }

        next();
    } catch (error) {
        // En cas d'erreur, continuer sans utilisateur
        logger.warn(
            { error: error.message },
            "Authentification optionnelle échouée"
        );
        next();
    }
};

// Middleware de vérification des rôles
export const requireRole = (...allowedRoles: string[]) => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        try {
            if (!req.user) {
                throw new UnauthorizedError("Authentification requise");
            }

            if (!allowedRoles.includes(req.user.role)) {
                throw new ForbiddenError(
                    `Rôle ${
                        req.user.role
                    } non autorisé. Rôles requis: ${allowedRoles.join(", ")}`
                );
            }

            logger.debug(
                {
                    userId: req.user.id,
                    role: req.user.role,
                    allowedRoles,
                    path: req.path,
                },
                "Vérification de rôle réussie"
            );

            next();
        } catch (error) {
            next(error);
        }
    };
};

// Middleware de vérification des permissions
export const requirePermission = (action: string, resource: string) => {
    return async (
        req: AuthRequest,
        res: Response,
        next: NextFunction
    ): Promise<void> => {
        try {
            if (!req.user) {
                throw new UnauthorizedError("Authentification requise");
            }

            const hasPermission = await authService.checkPermission(
                req.user.id,
                action,
                resource
            );

            if (!hasPermission) {
                throw new PermissionError(action, resource);
            }

            logger.debug(
                {
                    userId: req.user.id,
                    action,
                    resource,
                    path: req.path,
                },
                "Vérification de permission réussie"
            );

            next();
        } catch (error) {
            next(error);
        }
    };
};

// Middleware pour vérifier l'appartenance à une entreprise
export const requireCompany = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    try {
        if (!req.user) {
            throw new UnauthorizedError("Authentification requise");
        }

        if (!req.user.company_id) {
            throw new ForbiddenError(
                "Utilisateur non associé à une entreprise"
            );
        }

        next();
    } catch (error) {
        next(error);
    }
};

// Middleware pour vérifier que l'utilisateur accède à ses propres données ou aux données de son entreprise
export const requireOwnership = (paramName: string = "id") => {
    return (req: AuthRequest, res: Response, next: NextFunction): void => {
        try {
            if (!req.user) {
                throw new UnauthorizedError("Authentification requise");
            }

            const resourceId = req.params[paramName];

            // Les admins peuvent accéder à tout
            if (req.user.role === "ADMIN") {
                return next();
            }

            // Vérifier si l'utilisateur accède à ses propres données
            if (resourceId === req.user.id) {
                return next();
            }

            // Pour les autres ressources, vérifier via l'entreprise (sera implémenté dans les services)
            next();
        } catch (error) {
            next(error);
        }
    };
};

// Middleware pour valider l'entreprise dans les paramètres
export const validateCompanyAccess = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    try {
        if (!req.user) {
            throw new UnauthorizedError("Authentification requise");
        }

        const companyId =
            req.params.companyId || req.body.company_id || req.query.company_id;

        if (companyId && req.user.company_id !== companyId) {
            // Seuls les admins peuvent accéder aux données d'autres entreprises
            if (req.user.role !== "ADMIN") {
                throw new ForbiddenError(
                    "Accès interdit aux données de cette entreprise"
                );
            }
        }

        next();
    } catch (error) {
        next(error);
    }
};

// Middleware pour les endpoints d'administration
export const requireAdmin = requireRole("ADMIN");

// Middleware pour les endpoints de gestion
export const requireManager = requireRole("ADMIN", "MANAGER");

// Middleware pour les endpoints comptables
export const requireAccountant = requireRole("ADMIN", "MANAGER", "ACCOUNTANT");

// Middleware pour les endpoints commerciaux
export const requireSales = requireRole(
    "ADMIN",
    "MANAGER",
    "ACCOUNTANT",
    "SALES"
);

// Middleware pour vérifier que l'utilisateur a terminé l'onboarding
export const requireOnboarding = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    try {
        if (!req.user) {
            throw new UnauthorizedError("Authentification requise");
        }

        if (!req.user.onboarding_completed) {
            throw new ForbiddenError("Onboarding non terminé");
        }

        next();
    } catch (error) {
        next(error);
    }
};

// Middleware pour les routes nécessitant Stripe
export const requireStripe = (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): void => {
    try {
        if (!req.user) {
            throw new UnauthorizedError("Authentification requise");
        }

        if (!req.user.stripe_onboarded || !req.user.stripe_account_id) {
            throw new ForbiddenError("Configuration Stripe requise");
        }

        next();
    } catch (error) {
        next(error);
    }
};

// Exporter tous les middlewares
export default {
    authenticate,
    optionalAuth,
    requireRole,
    requirePermission,
    requireCompany,
    requireOwnership,
    validateCompanyAccess,
    requireAdmin,
    requireManager,
    requireAccountant,
    requireSales,
    requireOnboarding,
    requireStripe,
};
