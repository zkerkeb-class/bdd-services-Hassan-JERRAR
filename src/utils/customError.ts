export class CustomError extends Error {
    public statusCode: number;
    public isOperational: boolean;
    public code?: string;
    public details?: Record<string, any>;

    constructor(
        message: string,
        statusCode: number = 500,
        isOperational: boolean = true,
        code?: string,
        details?: Record<string, any>
    ) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = isOperational;
        this.code = code;
        this.details = details;

        // Capture la stack trace
        Error.captureStackTrace(this, this.constructor);
    }
}

// Erreurs spécifiques au métier

export class BusinessError extends CustomError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 400, true, "BUSINESS_ERROR", details);
    }
}

export class ValidationError extends CustomError {
    constructor(message: string, errors: Record<string, any>) {
        super(message, 422, true, "VALIDATION_ERROR", { errors });
    }
}

export class NotFoundError extends CustomError {
    constructor(resource: string, identifier?: string) {
        const message = identifier
            ? `${resource} avec l'identifiant '${identifier}' non trouvé`
            : `${resource} non trouvé`;
        super(message, 404, true, "NOT_FOUND", { resource, identifier });
    }
}

export class UnauthorizedError extends CustomError {
    constructor(message: string = "Non autorisé") {
        super(message, 401, true, "UNAUTHORIZED");
    }
}

export class ForbiddenError extends CustomError {
    constructor(message: string = "Accès interdit") {
        super(message, 403, true, "FORBIDDEN");
    }
}

export class ConflictError extends CustomError {
    constructor(message: string, details?: Record<string, any>) {
        super(message, 409, true, "CONFLICT", details);
    }
}

export class RateLimitError extends CustomError {
    constructor(message: string = "Limite de taux dépassée") {
        super(message, 429, true, "RATE_LIMIT");
    }
}

// Erreurs spécifiques aux entités business

export class CompanyError extends BusinessError {
    constructor(message: string, details?: Record<string, any>) {
        super(`Erreur entreprise: ${message}`, details);
        this.code = "COMPANY_ERROR";
    }
}

export class CustomerError extends BusinessError {
    constructor(message: string, details?: Record<string, any>) {
        super(`Erreur client: ${message}`, details);
        this.code = "CUSTOMER_ERROR";
    }
}

export class InvoiceError extends BusinessError {
    constructor(message: string, details?: Record<string, any>) {
        super(`Erreur facture: ${message}`, details);
        this.code = "INVOICE_ERROR";
    }
}

export class QuoteError extends BusinessError {
    constructor(message: string, details?: Record<string, any>) {
        super(`Erreur devis: ${message}`, details);
        this.code = "QUOTE_ERROR";
    }
}

export class ProductError extends BusinessError {
    constructor(message: string, details?: Record<string, any>) {
        super(`Erreur produit: ${message}`, details);
        this.code = "PRODUCT_ERROR";
    }
}

export class PaymentError extends BusinessError {
    constructor(message: string, details?: Record<string, any>) {
        super(`Erreur paiement: ${message}`, details);
        this.code = "PAYMENT_ERROR";
    }
}

// Erreurs de base de données

export class DatabaseError extends CustomError {
    constructor(message: string, details?: Record<string, any>) {
        super(
            `Erreur base de données: ${message}`,
            500,
            true,
            "DATABASE_ERROR",
            details
        );
    }
}

export class DuplicateError extends DatabaseError {
    constructor(field: string, value: string) {
        super(`Une entrée avec ${field} '${value}' existe déjà`, {
            field,
            value,
        });
        this.code = "DUPLICATE_ERROR";
        this.statusCode = 409;
    }
}

export class ForeignKeyError extends DatabaseError {
    constructor(table: string, field: string, value: string) {
        super(`Référence non valide pour ${field} '${value}' dans ${table}`, {
            table,
            field,
            value,
        });
        this.code = "FOREIGN_KEY_ERROR";
        this.statusCode = 400;
    }
}

// Erreurs d'authentification et autorisation

export class AuthenticationError extends CustomError {
    constructor(message: string = "Échec de l'authentification") {
        super(message, 401, true, "AUTHENTICATION_ERROR");
    }
}

export class TokenError extends AuthenticationError {
    constructor(message: string = "Token invalide ou expiré") {
        super(message);
        this.code = "TOKEN_ERROR";
    }
}

export class PermissionError extends ForbiddenError {
    constructor(action: string, resource: string) {
        super(`Permission insuffisante pour ${action} sur ${resource}`);
        this.code = "PERMISSION_ERROR";
        this.details = { action, resource };
    }
}

// Erreurs de validation métier

export class StockError extends ProductError {
    constructor(
        message: string,
        productId: string,
        requestedQuantity: number,
        availableQuantity: number
    ) {
        super(message, { productId, requestedQuantity, availableQuantity });
        this.code = "STOCK_ERROR";
    }
}

export class PricingError extends ProductError {
    constructor(message: string, productId: string) {
        super(message, { productId });
        this.code = "PRICING_ERROR";
    }
}

export class InvoiceStatusError extends InvoiceError {
    constructor(currentStatus: string, attemptedAction: string) {
        super(
            `Impossible de ${attemptedAction} une facture avec le statut ${currentStatus}`,
            {
                currentStatus,
                attemptedAction,
            }
        );
        this.code = "INVOICE_STATUS_ERROR";
    }
}

export class QuoteStatusError extends QuoteError {
    constructor(currentStatus: string, attemptedAction: string) {
        super(
            `Impossible de ${attemptedAction} un devis avec le statut ${currentStatus}`,
            {
                currentStatus,
                attemptedAction,
            }
        );
        this.code = "QUOTE_STATUS_ERROR";
    }
}

export class PaymentAmountError extends PaymentError {
    constructor(invoiceAmount: number, paymentAmount: number) {
        super(
            `Montant de paiement invalide: ${paymentAmount} pour une facture de ${invoiceAmount}`,
            {
                invoiceAmount,
                paymentAmount,
            }
        );
        this.code = "PAYMENT_AMOUNT_ERROR";
    }
}

// Erreurs de cache et externe

export class CacheError extends CustomError {
    constructor(message: string, details?: Record<string, any>) {
        super(`Erreur cache: ${message}`, 500, true, "CACHE_ERROR", details);
    }
}

export class ExternalServiceError extends CustomError {
    constructor(
        service: string,
        message: string,
        details?: Record<string, any>
    ) {
        super(
            `Erreur service externe ${service}: ${message}`,
            503,
            true,
            "EXTERNAL_SERVICE_ERROR",
            {
                service,
                ...details,
            }
        );
    }
}

// Fonction utilitaire pour vérifier si une erreur est opérationnelle
export const isOperationalError = (error: Error): boolean => {
    if (error instanceof CustomError) {
        return error.isOperational;
    }
    return false;
};

// Types pour l'export
export type ErrorCode =
    | "BUSINESS_ERROR"
    | "VALIDATION_ERROR"
    | "NOT_FOUND"
    | "UNAUTHORIZED"
    | "FORBIDDEN"
    | "CONFLICT"
    | "RATE_LIMIT"
    | "COMPANY_ERROR"
    | "CUSTOMER_ERROR"
    | "INVOICE_ERROR"
    | "QUOTE_ERROR"
    | "PRODUCT_ERROR"
    | "PAYMENT_ERROR"
    | "DATABASE_ERROR"
    | "DUPLICATE_ERROR"
    | "FOREIGN_KEY_ERROR"
    | "AUTHENTICATION_ERROR"
    | "TOKEN_ERROR"
    | "PERMISSION_ERROR"
    | "STOCK_ERROR"
    | "PRICING_ERROR"
    | "INVOICE_STATUS_ERROR"
    | "QUOTE_STATUS_ERROR"
    | "PAYMENT_AMOUNT_ERROR"
    | "CACHE_ERROR"
    | "EXTERNAL_SERVICE_ERROR";
