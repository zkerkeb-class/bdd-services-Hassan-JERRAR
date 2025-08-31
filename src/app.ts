import express, { Application, Request, Response, NextFunction } from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { createBullBoard } from "@bull-board/api";
import { BullAdapter } from "@bull-board/api/bullAdapter";
import { ExpressAdapter } from "@bull-board/express";

// Import des middlewares et utilitaires
import { loggerMiddleware } from "./middlewares/logger.middleware";
import {
    errorMiddleware,
    notFoundHandler,
} from "./middlewares/error.middleware";
import logger from "./utils/logger";
import ApiResponse from "./utils/apiResponse";

// Import des routes
import routes from "./routes";

// Import des services pour l'initialisation
import prisma from "./lib/prisma";
import cacheService from "./lib/redis";
import authService from "./lib/supabase";

class BusinessMicroservice {
    public app: Application;
    private readonly port: number;

    constructor() {
        this.app = express();
        this.port = parseInt(process.env.PORT || "3001");

        this.initializeMiddlewares();
        this.initializeRoutes();
        this.initializeErrorHandling();
        this.initializeBullBoard();
    }

    private initializeMiddlewares(): void {
        // Sécurité
        this.app.use(
            helmet({
                contentSecurityPolicy: false, // Désactivé pour les dashboards
                crossOriginEmbedderPolicy: false,
            })
        );

        // CORS
        this.app.use(
            cors({
                origin: process.env.ALLOWED_ORIGINS?.split(",") || [
                    "http://localhost:3000",
                ],
                credentials: true,
                methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
                allowedHeaders: [
                    "Content-Type",
                    "Authorization",
                    "x-company-id",
                ],
            })
        );

        // Compression
        this.app.use(compression());

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: process.env.NODE_ENV === "production" ? 100 : 1000, // limite par IP
            message: {
                success: false,
                message:
                    "Trop de requêtes depuis cette IP, veuillez réessayer plus tard",
                error_code: "RATE_LIMIT_EXCEEDED",
            },
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use("/api", limiter);

        // Parsing
        this.app.use(
            express.json({
                limit: "10mb",
                verify: (req: any, res, buf) => {
                    req.rawBody = buf;
                },
            })
        );
        this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

        // Logging
        this.app.use(loggerMiddleware);

        // Health check sans authentification
        this.app.get("/health", (req: Request, res: Response) => {
            ApiResponse.success(
                res,
                {
                    status: "healthy",
                    service: "business-microservice",
                    timestamp: new Date().toISOString(),
                    uptime: process.uptime(),
                    version: "1.0.0",
                },
                "Service en fonctionnement"
            );
        });

        // Route de base
        this.app.get("/", (req: Request, res: Response) => {
            ApiResponse.success(
                res,
                {
                    service: "ZenBilling Business Microservice",
                    version: "1.0.0",
                    description:
                        "Microservice métier principal pour la gestion des entreprises, clients, factures, devis et produits",
                    endpoints: {
                        api: "/api",
                        health: "/health",
                        docs: "/docs",
                        admin: "/admin",
                    },
                    timestamp: new Date().toISOString(),
                },
                "Service business ZenBilling"
            );
        });
    }

    private initializeRoutes(): void {
        // Routes API principales
        this.app.use("/api", routes);

        // Documentation API (si Swagger est configuré)
        if (process.env.NODE_ENV !== "production") {
            this.app.get("/docs", (req: Request, res: Response) => {
                res.json({
                    message: "Documentation API Swagger à implémenter",
                    endpoints: {
                        companies: "/api/companies",
                        customers: "/api/customers",
                        invoices: "/api/invoices",
                        quotes: "/api/quotes",
                        products: "/api/products",
                        health: "/api/health",
                    },
                });
            });
        }
    }

    private initializeBullBoard(): void {
        // Configuration du dashboard Bull pour les tâches en arrière-plan
        if (process.env.NODE_ENV !== "production") {
            try {
                // Créer les adaptateurs pour les queues (si implémentées)
                const serverAdapter = new ExpressAdapter();
                serverAdapter.setBasePath("/admin/queues");

                // Note: Ajouter les queues ici quand elles seront implémentées
                // const emailQueue = new Queue("email");
                // const pdfQueue = new Queue("pdf");

                createBullBoard({
                    queues: [
                        // new BullAdapter(emailQueue),
                        // new BullAdapter(pdfQueue),
                    ],
                    serverAdapter: serverAdapter,
                });

                this.app.use("/admin/queues", serverAdapter.getRouter());

                logger.info("Bull Board dashboard configuré sur /admin/queues");
            } catch (error) {
                logger.warn("Impossible de configurer Bull Board", { error });
            }
        }
    }

    private initializeErrorHandling(): void {
        // 404 handler
        this.app.use(notFoundHandler);

        // Error handler global
        this.app.use(errorMiddleware);

        // Uncaught exception handler
        process.on("uncaughtException", (error: Error) => {
            logger.error("Uncaught Exception", {
                error: error.message,
                stack: error.stack,
            });
            this.gracefulShutdown("SIGTERM");
        });

        // Unhandled promise rejection handler
        process.on(
            "unhandledRejection",
            (reason: any, promise: Promise<any>) => {
                logger.error("Unhandled Rejection", { reason, promise });
                this.gracefulShutdown("SIGTERM");
            }
        );

        // Graceful shutdown handlers
        process.on("SIGTERM", () => this.gracefulShutdown("SIGTERM"));
        process.on("SIGINT", () => this.gracefulShutdown("SIGINT"));
    }

    public async start(): Promise<void> {
        try {
            // Initialiser les connexions aux services
            await this.initializeServices();

            // Démarrer le serveur
            this.app.listen(this.port, () => {
                logger.info(
                    `🚀 Business Microservice démarré sur le port ${this.port}`,
                    {
                        port: this.port,
                        environment: process.env.NODE_ENV || "development",
                        timestamp: new Date().toISOString(),
                    }
                );

                logger.info("📋 Endpoints disponibles:", {
                    health: `http://localhost:${this.port}/health`,
                    api: `http://localhost:${this.port}/api`,
                    companies: `http://localhost:${this.port}/api/companies`,
                    customers: `http://localhost:${this.port}/api/customers`,
                    invoices: `http://localhost:${this.port}/api/invoices`,
                    quotes: `http://localhost:${this.port}/api/quotes`,
                    products: `http://localhost:${this.port}/api/products`,
                    admin: `http://localhost:${this.port}/admin/queues`,
                });
            });
        } catch (error) {
            logger.error("❌ Erreur lors du démarrage du service", { error });
            process.exit(1);
        }
    }

    private async initializeServices(): Promise<void> {
        logger.info("🔄 Initialisation des services...");

        try {
            // Vérifier la connexion à la base de données
            await prisma.healthCheck();
            logger.info("✅ Base de données connectée");

            // Vérifier la connexion au cache Redis
            await cacheService.healthCheck();
            logger.info("✅ Cache Redis connecté");

            // Vérifier la connexion à Supabase
            await authService.healthCheck();
            logger.info("✅ Service d'authentification Supabase connecté");

            logger.info("🎉 Tous les services sont initialisés avec succès");
        } catch (error) {
            logger.error("❌ Erreur lors de l'initialisation des services", {
                error,
            });
            throw error;
        }
    }

    private async gracefulShutdown(signal: string): Promise<void> {
        logger.info(`📴 Arrêt gracieux du service (signal: ${signal})`);

        try {
            // Fermer les connexions aux services
            await prisma.$disconnect();
            logger.info("✅ Connexion base de données fermée");

            await cacheService.disconnect();
            logger.info("✅ Connexion cache fermée");

            logger.info("🏁 Arrêt gracieux terminé");
            process.exit(0);
        } catch (error) {
            logger.error("❌ Erreur lors de l'arrêt gracieux", { error });
            process.exit(1);
        }
    }
}

// Créer et exporter l'instance de l'application
const businessApp = new BusinessMicroservice();

export default businessApp.app;

// Démarrer le service si ce fichier est exécuté directement
if (require.main === module) {
    businessApp.start().catch((error) => {
        logger.error("❌ Échec du démarrage du service", { error });
        process.exit(1);
    });
}
