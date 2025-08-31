import { Router, Request, Response } from "express";
import prisma from "../lib/prisma";
import cacheService from "../lib/redis";
import authService from "../lib/supabase";
import ApiResponse from "../utils/apiResponse";
import { asyncHandler } from "../middlewares/error.middleware";

const router = Router();

// Health check simple
router.get("/", (req: Request, res: Response) => {
    ApiResponse.success(
        res,
        {
            status: "healthy",
            service: "business-microservice",
            version: "1.0.0",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        },
        "Service en fonctionnement"
    );
});

// Health check détaillé
router.get(
    "/detailed",
    asyncHandler(async (req: Request, res: Response) => {
        const startTime = Date.now();

        // Vérifier tous les services
        const [databaseHealth, cacheHealth, authHealth] =
            await Promise.allSettled([
                prisma.healthCheck(),
                cacheService.healthCheck(),
                authService.healthCheck(),
            ]);

        const responseTime = Date.now() - startTime;

        const health = {
            status: "healthy",
            service: "business-microservice",
            version: "1.0.0",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
            response_time_ms: responseTime,
            dependencies: {
                database: {
                    status:
                        databaseHealth.status === "fulfilled" &&
                        databaseHealth.value
                            ? "healthy"
                            : "unhealthy",
                    response_time_ms:
                        databaseHealth.status === "fulfilled"
                            ? "< 100ms"
                            : "timeout",
                },
                cache: {
                    status:
                        cacheHealth.status === "fulfilled" && cacheHealth.value
                            ? "healthy"
                            : "unhealthy",
                    response_time_ms:
                        cacheHealth.status === "fulfilled"
                            ? "< 50ms"
                            : "timeout",
                },
                auth: {
                    status:
                        authHealth.status === "fulfilled" && authHealth.value
                            ? "healthy"
                            : "unhealthy",
                    response_time_ms:
                        authHealth.status === "fulfilled"
                            ? "< 200ms"
                            : "timeout",
                },
            },
            system: {
                memory: {
                    used:
                        Math.round(
                            process.memoryUsage().heapUsed / 1024 / 1024
                        ) + " MB",
                    total:
                        Math.round(
                            process.memoryUsage().heapTotal / 1024 / 1024
                        ) + " MB",
                },
                cpu_usage: process.cpuUsage(),
                node_version: process.version,
                platform: process.platform,
            },
        };

        // Déterminer le statut global
        const allHealthy = Object.values(health.dependencies).every(
            (dep) => dep.status === "healthy"
        );
        if (!allHealthy) {
            health.status = "degraded";
        }

        const statusCode = health.status === "healthy" ? 200 : 503;

        ApiResponse.success(res, health, "Health check détaillé", statusCode);
    })
);

// Métriques Prometheus
router.get(
    "/metrics",
    asyncHandler(async (req: Request, res: Response) => {
        const stats = await prisma.getDatabaseStats();
        const cacheInfo = await cacheService.getCacheInfo();

        const metrics = [
            `# HELP business_service_uptime_seconds Service uptime in seconds`,
            `# TYPE business_service_uptime_seconds counter`,
            `business_service_uptime_seconds ${process.uptime()}`,
            ``,
            `# HELP business_service_memory_usage_bytes Memory usage in bytes`,
            `# TYPE business_service_memory_usage_bytes gauge`,
            `business_service_memory_usage_bytes{type="heap_used"} ${
                process.memoryUsage().heapUsed
            }`,
            `business_service_memory_usage_bytes{type="heap_total"} ${
                process.memoryUsage().heapTotal
            }`,
            ``,
            `# HELP business_database_records_total Total number of records by entity`,
            `# TYPE business_database_records_total gauge`,
            `business_database_records_total{entity="companies"} ${stats.companies}`,
            `business_database_records_total{entity="users"} ${stats.users}`,
            `business_database_records_total{entity="customers"} ${stats.customers}`,
            `business_database_records_total{entity="invoices"} ${stats.invoices}`,
            `business_database_records_total{entity="quotes"} ${stats.quotes}`,
            `business_database_records_total{entity="products"} ${stats.products}`,
            ``,
            `# HELP business_service_version_info Service version information`,
            `# TYPE business_service_version_info info`,
            `business_service_version_info{version="1.0.0",service="business-microservice"} 1`,
        ].join("\n");

        res.set("Content-Type", "text/plain");
        res.send(metrics);
    })
);

// Readiness probe
router.get(
    "/ready",
    asyncHandler(async (req: Request, res: Response) => {
        // Vérifier que tous les services critiques sont disponibles
        const databaseReady = await prisma.healthCheck();
        const cacheReady = await cacheService.healthCheck();

        if (databaseReady && cacheReady) {
            ApiResponse.success(
                res,
                {
                    status: "ready",
                    timestamp: new Date().toISOString(),
                },
                "Service prêt"
            );
        } else {
            ApiResponse.error(res, "Service non prêt", 503, "NOT_READY", {
                database: databaseReady,
                cache: cacheReady,
            });
        }
    })
);

// Liveness probe
router.get("/live", (req: Request, res: Response) => {
    ApiResponse.success(
        res,
        {
            status: "alive",
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        },
        "Service vivant"
    );
});

// Informations sur le service
router.get("/info", (req: Request, res: Response) => {
    ApiResponse.success(
        res,
        {
            service: "business-microservice",
            description: "Microservice métier principal pour ZenBilling",
            version: "1.0.0",
            author: "Hassan - ZenBilling Team",
            build_date: new Date().toISOString(),
            node_version: process.version,
            environment: process.env.NODE_ENV || "development",
            features: [
                "Gestion des entreprises",
                "Gestion des clients",
                "Gestion des factures",
                "Gestion des devis",
                "Gestion des produits",
                "Cache Redis",
                "Authentification Supabase",
                "Base de données PostgreSQL",
                "Monitoring et métriques",
            ],
            endpoints: {
                companies: "/api/companies",
                customers: "/api/customers",
                invoices: "/api/invoices",
                quotes: "/api/quotes",
                products: "/api/products",
            },
        },
        "Informations du service"
    );
});

export default router;
