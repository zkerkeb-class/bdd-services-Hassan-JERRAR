import { PrismaClient } from "@prisma/client";
import logger from "../utils/logger";

// Configuration du client Prisma avec logging
const prisma = new PrismaClient({
    log: [
        {
            emit: "event",
            level: "query",
        },
        {
            emit: "event",
            level: "error",
        },
        {
            emit: "event",
            level: "info",
        },
        {
            emit: "event",
            level: "warn",
        },
    ],
    errorFormat: "pretty",
});

// Configuration des événements de logging
prisma.$on("query", (e) => {
    if (process.env.NODE_ENV === "development") {
        logger.debug(
            {
                query: e.query,
                params: e.params,
                duration: `${e.duration}ms`,
                target: e.target,
            },
            "Prisma Query"
        );
    }
});

prisma.$on("error", (e) => {
    logger.error(
        {
            target: e.target,
            message: e.message,
            timestamp: e.timestamp,
        },
        "Prisma Error"
    );
});

prisma.$on("info", (e) => {
    logger.info(
        {
            target: e.target,
            message: e.message,
            timestamp: e.timestamp,
        },
        "Prisma Info"
    );
});

prisma.$on("warn", (e) => {
    logger.warn(
        {
            target: e.target,
            message: e.message,
            timestamp: e.timestamp,
        },
        "Prisma Warning"
    );
});

// Gestion propre de la déconnexion
process.on("beforeExit", async () => {
    logger.info("Déconnexion de Prisma...");
    await prisma.$disconnect();
});

process.on("SIGINT", async () => {
    logger.info("Signal SIGINT reçu, déconnexion de Prisma...");
    await prisma.$disconnect();
    process.exit(0);
});

process.on("SIGTERM", async () => {
    logger.info("Signal SIGTERM reçu, déconnexion de Prisma...");
    await prisma.$disconnect();
    process.exit(0);
});

// Extension du client Prisma avec des méthodes utilitaires
class ExtendedPrismaClient {
    private client: PrismaClient;

    constructor(client: PrismaClient) {
        this.client = client;
    }

    // Accès direct au client Prisma
    get prisma() {
        return this.client;
    }

    // Méthode pour vérifier la connexion
    async healthCheck(): Promise<boolean> {
        try {
            await this.client.$queryRaw`SELECT 1`;
            return true;
        } catch (error) {
            logger.error({ error }, "Échec du health check Prisma");
            return false;
        }
    }

    // Méthode pour obtenir les statistiques de la base de données
    async getDatabaseStats() {
        try {
            const [
                companyCount,
                userCount,
                customerCount,
                invoiceCount,
                quoteCount,
                productCount,
            ] = await Promise.all([
                this.client.company.count(),
                this.client.user.count(),
                this.client.customer.count(),
                this.client.invoice.count(),
                this.client.quote.count(),
                this.client.product.count(),
            ]);

            return {
                companies: companyCount,
                users: userCount,
                customers: customerCount,
                invoices: invoiceCount,
                quotes: quoteCount,
                products: productCount,
            };
        } catch (error) {
            logger.error(
                { error },
                "Erreur lors de la récupération des statistiques DB"
            );
            throw error;
        }
    }

    // Méthode pour nettoyer les données expirées
    async cleanupExpiredData() {
        try {
            const now = new Date();
            const thirtyDaysAgo = new Date(
                now.getTime() - 30 * 24 * 60 * 60 * 1000
            );

            // Nettoyage des sessions expirées
            const deletedSessions = await this.client.session.deleteMany({
                where: {
                    expires: {
                        lt: now,
                    },
                },
            });

            logger.info(
                `Nettoyage terminé: ${deletedSessions.count} sessions expirées supprimées`
            );

            return {
                deletedSessions: deletedSessions.count,
            };
        } catch (error) {
            logger.error(
                { error },
                "Erreur lors du nettoyage des données expirées"
            );
            throw error;
        }
    }

    // Méthode pour exécuter une transaction avec retry
    async withRetry<T>(
        operation: (tx: any) => Promise<T>,
        maxRetries: number = 3
    ): Promise<T> {
        let lastError: Error;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                return await this.client.$transaction(operation);
            } catch (error) {
                lastError = error as Error;
                logger.warn(
                    {
                        attempt,
                        maxRetries,
                        error: error.message,
                    },
                    "Tentative de transaction échouée"
                );

                if (attempt === maxRetries) {
                    break;
                }

                // Attendre avant la prochaine tentative
                await new Promise((resolve) =>
                    setTimeout(resolve, attempt * 1000)
                );
            }
        }

        logger.error(
            { error: lastError },
            "Transaction échouée après tous les essais"
        );
        throw lastError!;
    }
}

// Instance étendue du client Prisma
const extendedPrisma = new ExtendedPrismaClient(prisma);

export default extendedPrisma;
export { prisma };
