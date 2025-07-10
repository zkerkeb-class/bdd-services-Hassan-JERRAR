import { Response } from "express";

export interface IApiResponse<T = any> {
    success: boolean;
    message: string;
    data?: T;
    error?: string;
    errors?: Record<string, any>;
    meta?: {
        page?: number;
        limit?: number;
        total?: number;
        totalPages?: number;
        hasNextPage?: boolean;
        hasPreviousPage?: boolean;
        timestamp: string;
        requestId?: string;
    };
}

class ApiResponse {
    /**
     * Réponse de succès
     */
    static success<T>(
        res: Response,
        data: T,
        message: string = "Opération réussie",
        statusCode: number = 200,
        meta?: any
    ): Response {
        const response: IApiResponse<T> = {
            success: true,
            message,
            data,
            meta: {
                ...meta,
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId,
            },
        };

        return res.status(statusCode).json(response);
    }

    /**
     * Réponse d'erreur
     */
    static error(
        res: Response,
        message: string = "Une erreur est survenue",
        statusCode: number = 500,
        error?: string,
        errors?: Record<string, any>
    ): Response {
        const response: IApiResponse = {
            success: false,
            message,
            error,
            errors,
            meta: {
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId,
            },
        };

        return res.status(statusCode).json(response);
    }

    /**
     * Réponse de données paginées
     */
    static paginated<T>(
        res: Response,
        data: T[],
        total: number,
        page: number,
        limit: number,
        message: string = "Données récupérées avec succès",
        statusCode: number = 200
    ): Response {
        const totalPages = Math.ceil(total / limit);
        const hasNextPage = page < totalPages;
        const hasPreviousPage = page > 1;

        const response: IApiResponse<T[]> = {
            success: true,
            message,
            data,
            meta: {
                page,
                limit,
                total,
                totalPages,
                hasNextPage,
                hasPreviousPage,
                timestamp: new Date().toISOString(),
                requestId: res.locals.requestId,
            },
        };

        return res.status(statusCode).json(response);
    }

    /**
     * Réponse créée avec succès
     */
    static created<T>(
        res: Response,
        data: T,
        message: string = "Ressource créée avec succès"
    ): Response {
        return this.success(res, data, message, 201);
    }

    /**
     * Réponse de suppression réussie
     */
    static deleted(
        res: Response,
        message: string = "Ressource supprimée avec succès"
    ): Response {
        return this.success(res, null, message, 204);
    }

    /**
     * Réponse non trouvée
     */
    static notFound(
        res: Response,
        message: string = "Ressource non trouvée"
    ): Response {
        return this.error(res, message, 404);
    }

    /**
     * Réponse non autorisée
     */
    static unauthorized(
        res: Response,
        message: string = "Non autorisé"
    ): Response {
        return this.error(res, message, 401);
    }

    /**
     * Réponse interdite
     */
    static forbidden(
        res: Response,
        message: string = "Accès interdit"
    ): Response {
        return this.error(res, message, 403);
    }

    /**
     * Réponse de validation échouée
     */
    static validation(
        res: Response,
        errors: Record<string, any>,
        message: string = "Erreurs de validation"
    ): Response {
        return this.error(res, message, 422, undefined, errors);
    }

    /**
     * Réponse de conflit
     */
    static conflict(
        res: Response,
        message: string = "Conflit de ressource"
    ): Response {
        return this.error(res, message, 409);
    }

    /**
     * Réponse de limite de taux dépassée
     */
    static rateLimited(
        res: Response,
        message: string = "Limite de taux dépassée"
    ): Response {
        return this.error(res, message, 429);
    }

    /**
     * Réponse de maintenance
     */
    static maintenance(
        res: Response,
        message: string = "Service en maintenance"
    ): Response {
        return this.error(res, message, 503);
    }
}

export default ApiResponse;
