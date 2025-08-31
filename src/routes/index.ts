import { Router } from "express";
import companyRoutes from "./company.routes";
import customerRoutes from "./customer.routes";
import invoiceRoutes from "./invoice.routes";
import quoteRoutes from "./quote.routes";
import productRoutes from "./product.routes";
import healthRoutes from "./health.routes";

const router = Router();

// Routes principales du microservice business
router.use("/companies", companyRoutes);
router.use("/customers", customerRoutes);
router.use("/invoices", invoiceRoutes);
router.use("/quotes", quoteRoutes);
router.use("/products", productRoutes);
router.use("/health", healthRoutes);

// Route de base pour vérifier le service
router.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Microservice Business ZenBilling - API REST",
        version: "1.0.0",
        endpoints: {
            companies: "/api/companies",
            customers: "/api/customers",
            invoices: "/api/invoices",
            quotes: "/api/quotes",
            products: "/api/products",
            health: "/api/health",
        },
        timestamp: new Date().toISOString(),
    });
});

export default router;
