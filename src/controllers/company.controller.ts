import { Response, NextFunction } from "express";
import { AuthRequest } from "../interfaces/auth.interface";
import companyService from "../services/company.service";
import ApiResponse from "../utils/apiResponse";
import { asyncHandler } from "../middlewares/error.middleware";
import logger from "../utils/logger";

class CompanyController {
    // Créer une nouvelle entreprise
    createCompany = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const company = await companyService.createCompany(
                    req.body,
                    req.user!.id
                );

                logger.info(
                    {
                        companyId: company.company_id,
                        userId: req.user!.id,
                    },
                    "Entreprise créée via API"
                );

                ApiResponse.created(
                    res,
                    company,
                    "Entreprise créée avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Récupérer une entreprise par ID
    getCompany = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                const company = await companyService.getCompanyById(companyId);

                ApiResponse.success(
                    res,
                    company,
                    "Entreprise récupérée avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Récupérer une entreprise par SIRET
    getCompanyBySiret = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { siret } = req.params;
                const company = await companyService.getCompanyBySiret(siret);

                ApiResponse.success(
                    res,
                    company,
                    "Entreprise récupérée avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Mettre à jour une entreprise
    updateCompany = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                const company = await companyService.updateCompany(
                    companyId,
                    req.body
                );

                logger.info(
                    {
                        companyId,
                        userId: req.user!.id,
                    },
                    "Entreprise mise à jour via API"
                );

                ApiResponse.success(
                    res,
                    company,
                    "Entreprise mise à jour avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Supprimer une entreprise
    deleteCompany = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                await companyService.deleteCompany(companyId);

                logger.info(
                    {
                        companyId,
                        userId: req.user!.id,
                    },
                    "Entreprise supprimée via API"
                );

                ApiResponse.success(
                    res,
                    null,
                    "Entreprise supprimée avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Lister les entreprises
    listCompanies = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const queryParams = {
                    page: parseInt(req.query.page as string) || 1,
                    limit: Math.min(
                        parseInt(req.query.limit as string) || 10,
                        100
                    ),
                    search: req.query.search as string,
                    industry: req.query.industry as string,
                    legal_form: req.query.legal_form as string,
                    is_active:
                        req.query.is_active === "true"
                            ? true
                            : req.query.is_active === "false"
                            ? false
                            : undefined,
                    sortBy: req.query.sortBy as string,
                    sortOrder: req.query.sortOrder as "asc" | "desc",
                };

                const result = await companyService.listCompanies(queryParams);

                ApiResponse.paginated(
                    res,
                    result.companies,
                    result.total,
                    result.page,
                    result.limit,
                    "Entreprises récupérées avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Récupérer les paramètres d'une entreprise
    getCompanySettings = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                const settings = await companyService.getCompanySettings(
                    companyId
                );

                ApiResponse.success(
                    res,
                    settings,
                    "Paramètres récupérés avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Mettre à jour les paramètres d'une entreprise
    updateCompanySettings = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                const settings = await companyService.updateCompanySettings(
                    companyId,
                    req.body
                );

                logger.info(
                    {
                        companyId,
                        userId: req.user!.id,
                    },
                    "Paramètres entreprise mis à jour via API"
                );

                ApiResponse.success(
                    res,
                    settings,
                    "Paramètres mis à jour avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Obtenir les statistiques d'une entreprise
    getCompanyStats = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                const stats = await companyService.getCompanyStats(companyId);

                ApiResponse.success(
                    res,
                    stats,
                    "Statistiques récupérées avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Générer le prochain numéro de facture
    getNextInvoiceNumber = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                const invoiceNumber = await companyService.getNextInvoiceNumber(
                    companyId
                );

                ApiResponse.success(
                    res,
                    { invoice_number: invoiceNumber },
                    "Numéro de facture généré"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Générer le prochain numéro de devis
    getNextQuoteNumber = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                const { companyId } = req.params;
                const quoteNumber = await companyService.getNextQuoteNumber(
                    companyId
                );

                ApiResponse.success(
                    res,
                    { quote_number: quoteNumber },
                    "Numéro de devis généré"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Récupérer l'entreprise de l'utilisateur connecté
    getMyCompany = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user!.company_id) {
                    return ApiResponse.notFound(
                        res,
                        "Aucune entreprise associée à cet utilisateur"
                    );
                }

                const company = await companyService.getCompanyById(
                    req.user!.company_id
                );
                ApiResponse.success(
                    res,
                    company,
                    "Entreprise récupérée avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Mettre à jour l'entreprise de l'utilisateur connecté
    updateMyCompany = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user!.company_id) {
                    return ApiResponse.notFound(
                        res,
                        "Aucune entreprise associée à cet utilisateur"
                    );
                }

                const company = await companyService.updateCompany(
                    req.user!.company_id,
                    req.body
                );

                logger.info(
                    {
                        companyId: req.user!.company_id,
                        userId: req.user!.id,
                    },
                    "Entreprise utilisateur mise à jour via API"
                );

                ApiResponse.success(
                    res,
                    company,
                    "Entreprise mise à jour avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Récupérer les paramètres de l'entreprise de l'utilisateur connecté
    getMyCompanySettings = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user!.company_id) {
                    return ApiResponse.notFound(
                        res,
                        "Aucune entreprise associée à cet utilisateur"
                    );
                }

                const settings = await companyService.getCompanySettings(
                    req.user!.company_id
                );
                ApiResponse.success(
                    res,
                    settings,
                    "Paramètres récupérés avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Mettre à jour les paramètres de l'entreprise de l'utilisateur connecté
    updateMyCompanySettings = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user!.company_id) {
                    return ApiResponse.notFound(
                        res,
                        "Aucune entreprise associée à cet utilisateur"
                    );
                }

                const settings = await companyService.updateCompanySettings(
                    req.user!.company_id,
                    req.body
                );

                logger.info(
                    {
                        companyId: req.user!.company_id,
                        userId: req.user!.id,
                    },
                    "Paramètres entreprise utilisateur mis à jour via API"
                );

                ApiResponse.success(
                    res,
                    settings,
                    "Paramètres mis à jour avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );

    // Obtenir les statistiques de l'entreprise de l'utilisateur connecté
    getMyCompanyStats = asyncHandler(
        async (req: AuthRequest, res: Response, next: NextFunction) => {
            try {
                if (!req.user!.company_id) {
                    return ApiResponse.notFound(
                        res,
                        "Aucune entreprise associée à cet utilisateur"
                    );
                }

                const stats = await companyService.getCompanyStats(
                    req.user!.company_id
                );
                ApiResponse.success(
                    res,
                    stats,
                    "Statistiques récupérées avec succès"
                );
            } catch (error) {
                next(error);
            }
        }
    );
}

export default new CompanyController();
