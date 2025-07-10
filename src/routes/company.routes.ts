import { Router } from "express";
import companyController from "../controllers/company.controller";
import authMiddleware from "../middlewares/auth.middleware";

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authMiddleware.authenticate);

// Routes pour l'entreprise de l'utilisateur connecté
router.get(
    "/me",
    authMiddleware.requireCompany,
    companyController.getMyCompany
);
router.put(
    "/me",
    authMiddleware.requireCompany,
    companyController.updateMyCompany
);
router.get(
    "/me/settings",
    authMiddleware.requireCompany,
    companyController.getMyCompanySettings
);
router.put(
    "/me/settings",
    authMiddleware.requireCompany,
    companyController.updateMyCompanySettings
);
router.get(
    "/me/stats",
    authMiddleware.requireCompany,
    companyController.getMyCompanyStats
);

// Routes d'administration (pour les admins uniquement)
router.get("/", authMiddleware.requireAdmin, companyController.listCompanies);
router.post("/", authMiddleware.requireAdmin, companyController.createCompany);

// Routes spécifiques par ID
router.get(
    "/:companyId",
    authMiddleware.validateCompanyAccess,
    companyController.getCompany
);
router.put(
    "/:companyId",
    authMiddleware.validateCompanyAccess,
    authMiddleware.requireManager,
    companyController.updateCompany
);
router.delete(
    "/:companyId",
    authMiddleware.requireAdmin,
    companyController.deleteCompany
);

// Routes pour les paramètres
router.get(
    "/:companyId/settings",
    authMiddleware.validateCompanyAccess,
    companyController.getCompanySettings
);
router.put(
    "/:companyId/settings",
    authMiddleware.validateCompanyAccess,
    authMiddleware.requireManager,
    companyController.updateCompanySettings
);

// Routes pour les statistiques
router.get(
    "/:companyId/stats",
    authMiddleware.validateCompanyAccess,
    companyController.getCompanyStats
);

// Routes utilitaires
router.get(
    "/:companyId/next-invoice-number",
    authMiddleware.validateCompanyAccess,
    companyController.getNextInvoiceNumber
);
router.get(
    "/:companyId/next-quote-number",
    authMiddleware.validateCompanyAccess,
    companyController.getNextQuoteNumber
);

// Route par SIRET
router.get(
    "/siret/:siret",
    authMiddleware.requireAdmin,
    companyController.getCompanyBySiret
);

export default router;
