import Redis from "ioredis";
import logger from "../utils/logger";

// Configuration Redis
const redisConfig = {
    host: process.env.REDIS_HOST || "localhost",
    port: parseInt(process.env.REDIS_PORT || "6379"),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_DB || "0"),
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    keepAlive: 30000,
    family: 4,
    keyPrefix: "business:",
};

// Client Redis principal
const redis = new Redis(redisConfig);

// Gestion des événements Redis
redis.on("connect", () => {
    logger.info("Connexion Redis établie");
});

redis.on("ready", () => {
    logger.info("Redis prêt");
});

redis.on("error", (error) => {
    logger.error({ error }, "Erreur Redis");
});

redis.on("close", () => {
    logger.warn("Connexion Redis fermée");
});

redis.on("reconnecting", () => {
    logger.info("Reconnexion Redis en cours...");
});

// Service de cache pour le microservice business
class CacheService {
    private client: Redis;
    private defaultTTL: number = 3600; // 1 heure par défaut

    constructor(client: Redis) {
        this.client = client;
    }

    // Méthode générique pour set
    async set(key: string, value: any, ttl?: number): Promise<void> {
        try {
            const serializedValue = JSON.stringify(value);
            const expiration = ttl || this.defaultTTL;

            await this.client.setex(key, expiration, serializedValue);

            logger.debug({ key, ttl: expiration }, "Cache set");
        } catch (error) {
            logger.error({ error, key }, "Erreur lors du cache set");
            throw error;
        }
    }

    // Méthode générique pour get
    async get<T>(key: string): Promise<T | null> {
        try {
            const value = await this.client.get(key);

            if (!value) {
                return null;
            }

            const parsed = JSON.parse(value);
            logger.debug({ key }, "Cache hit");

            return parsed as T;
        } catch (error) {
            logger.error({ error, key }, "Erreur lors du cache get");
            return null;
        }
    }

    // Supprimer une clé
    async del(key: string | string[]): Promise<number> {
        try {
            const result = await this.client.del(key);
            logger.debug({ key }, "Cache deleted");
            return result;
        } catch (error) {
            logger.error({ error, key }, "Erreur lors du cache del");
            throw error;
        }
    }

    // Supprimer par pattern
    async delPattern(pattern: string): Promise<number> {
        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                const result = await this.client.del(...keys);
                logger.debug(
                    { pattern, count: result },
                    "Cache pattern deleted"
                );
                return result;
            }
            return 0;
        } catch (error) {
            logger.error({ error, pattern }, "Erreur lors du cache delPattern");
            throw error;
        }
    }

    // Vérifier l'existence d'une clé
    async exists(key: string): Promise<boolean> {
        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            logger.error({ error, key }, "Erreur lors du cache exists");
            return false;
        }
    }

    // Obtenir le TTL d'une clé
    async ttl(key: string): Promise<number> {
        try {
            return await this.client.ttl(key);
        } catch (error) {
            logger.error({ error, key }, "Erreur lors du cache ttl");
            return -1;
        }
    }

    // Incrémenter une valeur
    async incr(key: string, ttl?: number): Promise<number> {
        try {
            const result = await this.client.incr(key);

            if (ttl && result === 1) {
                await this.client.expire(key, ttl);
            }

            return result;
        } catch (error) {
            logger.error({ error, key }, "Erreur lors du cache incr");
            throw error;
        }
    }

    // Cache spécifiques au business

    // Cache pour les entreprises
    async cacheCompany(
        companyId: string,
        data: any,
        ttl: number = 7200
    ): Promise<void> {
        await this.set(`company:${companyId}`, data, ttl);
    }

    async getCachedCompany<T>(companyId: string): Promise<T | null> {
        return await this.get<T>(`company:${companyId}`);
    }

    async invalidateCompany(companyId: string): Promise<void> {
        await this.delPattern(`company:${companyId}*`);
        await this.delPattern(`*:company:${companyId}*`);
    }

    // Cache pour les clients
    async cacheCustomer(
        customerId: string,
        data: any,
        ttl: number = 3600
    ): Promise<void> {
        await this.set(`customer:${customerId}`, data, ttl);
    }

    async getCachedCustomer<T>(customerId: string): Promise<T | null> {
        return await this.get<T>(`customer:${customerId}`);
    }

    async invalidateCustomer(customerId: string): Promise<void> {
        await this.delPattern(`customer:${customerId}*`);
        await this.delPattern(`*:customer:${customerId}*`);
    }

    // Cache pour les factures
    async cacheInvoice(
        invoiceId: string,
        data: any,
        ttl: number = 1800
    ): Promise<void> {
        await this.set(`invoice:${invoiceId}`, data, ttl);
    }

    async getCachedInvoice<T>(invoiceId: string): Promise<T | null> {
        return await this.get<T>(`invoice:${invoiceId}`);
    }

    async invalidateInvoice(invoiceId: string): Promise<void> {
        await this.delPattern(`invoice:${invoiceId}*`);
        await this.delPattern(`*:invoice:${invoiceId}*`);
    }

    // Cache pour les devis
    async cacheQuote(
        quoteId: string,
        data: any,
        ttl: number = 1800
    ): Promise<void> {
        await this.set(`quote:${quoteId}`, data, ttl);
    }

    async getCachedQuote<T>(quoteId: string): Promise<T | null> {
        return await this.get<T>(`quote:${quoteId}`);
    }

    async invalidateQuote(quoteId: string): Promise<void> {
        await this.delPattern(`quote:${quoteId}*`);
        await this.delPattern(`*:quote:${quoteId}*`);
    }

    // Cache pour les produits
    async cacheProduct(
        productId: string,
        data: any,
        ttl: number = 7200
    ): Promise<void> {
        await this.set(`product:${productId}`, data, ttl);
    }

    async getCachedProduct<T>(productId: string): Promise<T | null> {
        return await this.get<T>(`product:${productId}`);
    }

    async invalidateProduct(productId: string): Promise<void> {
        await this.delPattern(`product:${productId}*`);
        await this.delPattern(`*:product:${productId}*`);
    }

    // Cache pour les listes paginées
    async cacheList(
        listType: string,
        key: string,
        data: any,
        ttl: number = 600
    ): Promise<void> {
        await this.set(`list:${listType}:${key}`, data, ttl);
    }

    async getCachedList<T>(listType: string, key: string): Promise<T | null> {
        return await this.get<T>(`list:${listType}:${key}`);
    }

    async invalidateListCache(listType: string): Promise<void> {
        await this.delPattern(`list:${listType}:*`);
    }

    // Cache pour les statistiques
    async cacheStats(
        statsType: string,
        companyId: string,
        data: any,
        ttl: number = 900
    ): Promise<void> {
        await this.set(`stats:${statsType}:${companyId}`, data, ttl);
    }

    async getCachedStats<T>(
        statsType: string,
        companyId: string
    ): Promise<T | null> {
        return await this.get<T>(`stats:${statsType}:${companyId}`);
    }

    async invalidateStats(companyId: string): Promise<void> {
        await this.delPattern(`stats:*:${companyId}`);
    }

    // Méthode de santé
    async healthCheck(): Promise<boolean> {
        try {
            const result = await this.client.ping();
            return result === "PONG";
        } catch (error) {
            logger.error({ error }, "Échec du health check Redis");
            return false;
        }
    }

    // Statistiques du cache
    async getCacheInfo(): Promise<any> {
        try {
            const info = await this.client.info("memory");
            const keyspace = await this.client.info("keyspace");

            return {
                memory: info,
                keyspace: keyspace,
                connected: await this.healthCheck(),
            };
        } catch (error) {
            logger.error(
                { error },
                "Erreur lors de la récupération des infos cache"
            );
            return null;
        }
    }

    // Nettoyer tout le cache
    async flush(): Promise<void> {
        try {
            await this.client.flushdb();
            logger.info("Cache vidé");
        } catch (error) {
            logger.error({ error }, "Erreur lors du vidage du cache");
            throw error;
        }
    }
}

// Instance du service de cache
const cacheService = new CacheService(redis);

// Gestion propre de la déconnexion
process.on("beforeExit", () => {
    logger.info("Déconnexion Redis...");
    redis.disconnect();
});

process.on("SIGINT", () => {
    logger.info("Signal SIGINT reçu, déconnexion Redis...");
    redis.disconnect();
    process.exit(0);
});

process.on("SIGTERM", () => {
    logger.info("Signal SIGTERM reçu, déconnexion Redis...");
    redis.disconnect();
    process.exit(0);
});

export default cacheService;
export { redis };
