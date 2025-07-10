import prisma from "../lib/prisma";
import cacheService from "../lib/redis";
import logger from "../utils/logger";
import {
    ICompany,
    ICreateCompanyRequest,
    IUpdateCompanyRequest,
    ICompanySettings,
    IUpdateCompanySettingsRequest,
    ICompanyQueryParams,
    IPaginatedCompanies,
} from "../interfaces/company.interface";
import {
    CompanyError,
    NotFoundError,
    DuplicateError,
    ValidationError,
} from "../utils/customError";

class CompanyService {
    private cachePrefix = "company";
    private cacheTTL = 7200; // 2 heures

    // Créer une nouvelle entreprise
    async createCompany(
        data: ICreateCompanyRequest,
        userId: string
    ): Promise<ICompany> {
        try {
            logger.info(
                { data: { ...data, siret: data.siret } },
                "Création d'une nouvelle entreprise"
            );

            // Vérifier l'unicité du SIRET et SIREN
            const existingCompany = await prisma.prisma.company.findFirst({
                where: {
                    OR: [{ siret: data.siret }, { siren: data.siren }],
                },
            });

            if (existingCompany) {
                if (existingCompany.siret === data.siret) {
                    throw new DuplicateError("siret", data.siret);
                }
                if (existingCompany.siren === data.siren) {
                    throw new DuplicateError("siren", data.siren);
                }
            }

            // Créer l'entreprise avec paramètres par défaut
            const company = await prisma.prisma.company.create({
                data: {
                    ...data,
                    country: data.country || "France",
                    timezone: data.timezone || "Europe/Paris",
                    currency: data.currency || "EUR",
                    language: data.language || "fr",
                },
            });

            // Créer les paramètres par défaut de l'entreprise
            await this.createDefaultSettings(company.company_id);

            // Invalider le cache
            await this.invalidateCache(company.company_id);

            logger.info(
                { companyId: company.company_id },
                "Entreprise créée avec succès"
            );
            return company as ICompany;
        } catch (error) {
            logger.error(
                { error, data },
                "Erreur lors de la création de l'entreprise"
            );
            throw error instanceof CompanyError
                ? error
                : new CompanyError(
                      "Erreur lors de la création de l'entreprise"
                  );
        }
    }

    // Récupérer une entreprise par ID
    async getCompanyById(companyId: string): Promise<ICompany> {
        try {
            // Vérifier le cache
            const cacheKey = `${this.cachePrefix}:${companyId}`;
            const cached = await cacheService.get<ICompany>(cacheKey);
            if (cached) {
                return cached;
            }

            const company = await prisma.prisma.company.findUnique({
                where: { company_id: companyId },
                include: {
                    settings: true,
                    _count: {
                        select: {
                            customers: true,
                            invoices: true,
                            products: true,
                            quotes: true,
                            users: true,
                        },
                    },
                },
            });

            if (!company) {
                throw new NotFoundError("Entreprise", companyId);
            }

            // Mettre en cache
            await cacheService.set(cacheKey, company, this.cacheTTL);

            return company as ICompany;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération de l'entreprise"
            );
            throw new CompanyError(
                "Erreur lors de la récupération de l'entreprise"
            );
        }
    }

    // Récupérer une entreprise par SIRET
    async getCompanyBySiret(siret: string): Promise<ICompany> {
        try {
            const company = await prisma.prisma.company.findUnique({
                where: { siret },
                include: {
                    settings: true,
                    _count: {
                        select: {
                            customers: true,
                            invoices: true,
                            products: true,
                            quotes: true,
                            users: true,
                        },
                    },
                },
            });

            if (!company) {
                throw new NotFoundError("Entreprise", `SIRET: ${siret}`);
            }

            return company as ICompany;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, siret },
                "Erreur lors de la récupération de l'entreprise par SIRET"
            );
            throw new CompanyError(
                "Erreur lors de la récupération de l'entreprise"
            );
        }
    }

    // Mettre à jour une entreprise
    async updateCompany(
        companyId: string,
        data: IUpdateCompanyRequest
    ): Promise<ICompany> {
        try {
            logger.info({ companyId, data }, "Mise à jour de l'entreprise");

            // Vérifier que l'entreprise existe
            await this.getCompanyById(companyId);

            // Vérifier l'unicité si SIRET ou SIREN sont modifiés
            if (data.siret || data.siren) {
                const existing = await prisma.prisma.company.findFirst({
                    where: {
                        AND: [
                            { company_id: { not: companyId } },
                            {
                                OR: [
                                    data.siret ? { siret: data.siret } : {},
                                    data.siren ? { siren: data.siren } : {},
                                ].filter(
                                    (condition) =>
                                        Object.keys(condition).length > 0
                                ),
                            },
                        ],
                    },
                });

                if (existing) {
                    if (existing.siret === data.siret) {
                        throw new DuplicateError("siret", data.siret!);
                    }
                    if (existing.siren === data.siren) {
                        throw new DuplicateError("siren", data.siren!);
                    }
                }
            }

            const company = await prisma.prisma.company.update({
                where: { company_id: companyId },
                data,
                include: {
                    settings: true,
                    _count: {
                        select: {
                            customers: true,
                            invoices: true,
                            products: true,
                            quotes: true,
                            users: true,
                        },
                    },
                },
            });

            // Invalider le cache
            await this.invalidateCache(companyId);

            logger.info({ companyId }, "Entreprise mise à jour avec succès");
            return company as ICompany;
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof DuplicateError
            )
                throw error;
            logger.error(
                { error, companyId, data },
                "Erreur lors de la mise à jour de l'entreprise"
            );
            throw new CompanyError(
                "Erreur lors de la mise à jour de l'entreprise"
            );
        }
    }

    // Supprimer une entreprise
    async deleteCompany(companyId: string): Promise<void> {
        try {
            logger.info({ companyId }, "Suppression de l'entreprise");

            // Vérifier que l'entreprise existe
            await this.getCompanyById(companyId);

            // Supprimer en cascade (défini dans le schéma Prisma)
            await prisma.prisma.company.delete({
                where: { company_id: companyId },
            });

            // Invalider le cache
            await this.invalidateCache(companyId);

            logger.info({ companyId }, "Entreprise supprimée avec succès");
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, companyId },
                "Erreur lors de la suppression de l'entreprise"
            );
            throw new CompanyError(
                "Erreur lors de la suppression de l'entreprise"
            );
        }
    }

    // Lister les entreprises avec pagination et filtres
    async listCompanies(
        params: ICompanyQueryParams
    ): Promise<IPaginatedCompanies> {
        try {
            const {
                page = 1,
                limit = 10,
                search,
                industry,
                legal_form,
                is_active,
                sortBy = "createdAt",
                sortOrder = "desc",
            } = params;

            const skip = (page - 1) * limit;
            const cacheKey = `companies:list:${JSON.stringify(params)}`;

            // Vérifier le cache
            const cached =
                await cacheService.getCachedList<IPaginatedCompanies>(
                    "companies",
                    cacheKey
                );
            if (cached) {
                return cached;
            }

            // Construire les filtres
            const where: any = {};

            if (search) {
                where.OR = [
                    { name: { contains: search, mode: "insensitive" } },
                    { siret: { contains: search } },
                    { siren: { contains: search } },
                    { email: { contains: search, mode: "insensitive" } },
                ];
            }

            if (industry) {
                where.industry = { contains: industry, mode: "insensitive" };
            }

            if (legal_form) {
                where.legal_form = legal_form;
            }

            if (typeof is_active === "boolean") {
                where.is_active = is_active;
            }

            // Exécuter les requêtes en parallèle
            const [companies, total] = await Promise.all([
                prisma.prisma.company.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { [sortBy]: sortOrder },
                    include: {
                        _count: {
                            select: {
                                customers: true,
                                invoices: true,
                                products: true,
                                quotes: true,
                                users: true,
                            },
                        },
                    },
                }),
                prisma.prisma.company.count({ where }),
            ]);

            const result: IPaginatedCompanies = {
                companies: companies as ICompany[],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPreviousPage: page > 1,
            };

            // Mettre en cache
            await cacheService.cacheList("companies", cacheKey, result, 600); // 10 minutes

            return result;
        } catch (error) {
            logger.error(
                { error, params },
                "Erreur lors de la récupération des entreprises"
            );
            throw new CompanyError(
                "Erreur lors de la récupération des entreprises"
            );
        }
    }

    // Récupérer les paramètres d'une entreprise
    async getCompanySettings(companyId: string): Promise<ICompanySettings> {
        try {
            const settings = await prisma.prisma.companySettings.findUnique({
                where: { company_id: companyId },
            });

            if (!settings) {
                // Créer les paramètres par défaut s'ils n'existent pas
                return await this.createDefaultSettings(companyId);
            }

            return settings as ICompanySettings;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération des paramètres"
            );
            throw new CompanyError(
                "Erreur lors de la récupération des paramètres"
            );
        }
    }

    // Mettre à jour les paramètres d'une entreprise
    async updateCompanySettings(
        companyId: string,
        data: IUpdateCompanySettingsRequest
    ): Promise<ICompanySettings> {
        try {
            logger.info(
                { companyId, data },
                "Mise à jour des paramètres de l'entreprise"
            );

            const settings = await prisma.prisma.companySettings.upsert({
                where: { company_id: companyId },
                update: data,
                create: {
                    company_id: companyId,
                    ...data,
                },
            });

            // Invalider le cache
            await this.invalidateCache(companyId);

            logger.info({ companyId }, "Paramètres mis à jour avec succès");
            return settings as ICompanySettings;
        } catch (error) {
            logger.error(
                { error, companyId, data },
                "Erreur lors de la mise à jour des paramètres"
            );
            throw new CompanyError(
                "Erreur lors de la mise à jour des paramètres"
            );
        }
    }

    // Créer les paramètres par défaut
    private async createDefaultSettings(
        companyId: string
    ): Promise<ICompanySettings> {
        try {
            const settings = await prisma.prisma.companySettings.create({
                data: {
                    company_id: companyId,
                    invoice_prefix: "INV",
                    quote_prefix: "QUO",
                    invoice_numbering: "AUTO_INCREMENT",
                    quote_numbering: "AUTO_INCREMENT",
                    next_invoice_number: 1,
                    next_quote_number: 1,
                    default_payment_terms: 30,
                    default_currency: "EUR",
                    default_language: "fr",
                    default_vat_rate: "STANDARD",
                    auto_send_reminders: false,
                    fiscal_year_start: 1,
                    timezone: "Europe/Paris",
                    date_format: "DD/MM/YYYY",
                    number_format: "fr-FR",
                },
            });

            return settings as ICompanySettings;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la création des paramètres par défaut"
            );
            throw new CompanyError(
                "Erreur lors de la création des paramètres par défaut"
            );
        }
    }

    // Générer le prochain numéro de facture
    async getNextInvoiceNumber(companyId: string): Promise<string> {
        try {
            const settings = await this.getCompanySettings(companyId);
            const nextNumber = settings.next_invoice_number;

            // Mettre à jour le compteur
            await prisma.prisma.companySettings.update({
                where: { company_id: companyId },
                data: { next_invoice_number: nextNumber + 1 },
            });

            // Invalider le cache
            await this.invalidateCache(companyId);

            return `${settings.invoice_prefix}-${nextNumber
                .toString()
                .padStart(4, "0")}`;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la génération du numéro de facture"
            );
            throw new CompanyError(
                "Erreur lors de la génération du numéro de facture"
            );
        }
    }

    // Générer le prochain numéro de devis
    async getNextQuoteNumber(companyId: string): Promise<string> {
        try {
            const settings = await this.getCompanySettings(companyId);
            const nextNumber = settings.next_quote_number;

            // Mettre à jour le compteur
            await prisma.prisma.companySettings.update({
                where: { company_id: companyId },
                data: { next_quote_number: nextNumber + 1 },
            });

            // Invalider le cache
            await this.invalidateCache(companyId);

            return `${settings.quote_prefix}-${nextNumber
                .toString()
                .padStart(4, "0")}`;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la génération du numéro de devis"
            );
            throw new CompanyError(
                "Erreur lors de la génération du numéro de devis"
            );
        }
    }

    // Obtenir les statistiques d'une entreprise
    async getCompanyStats(companyId: string): Promise<any> {
        try {
            const cacheKey = `${this.cachePrefix}:stats:${companyId}`;
            const cached = await cacheService.getCachedStats(
                "company",
                companyId
            );
            if (cached) {
                return cached;
            }

            const [
                totalCustomers,
                totalProducts,
                totalInvoices,
                totalQuotes,
                totalUsers,
                totalRevenue,
                pendingInvoices,
                overdueInvoices,
            ] = await Promise.all([
                prisma.prisma.customer.count({
                    where: { company_id: companyId, is_active: true },
                }),
                prisma.prisma.product.count({
                    where: { company_id: companyId, is_active: true },
                }),
                prisma.prisma.invoice.count({
                    where: { company_id: companyId },
                }),
                prisma.prisma.quote.count({ where: { company_id: companyId } }),
                prisma.prisma.user.count({
                    where: { company_id: companyId, is_active: true },
                }),
                prisma.prisma.invoice.aggregate({
                    where: { company_id: companyId, payment_status: "paid" },
                    _sum: { amount_including_tax: true },
                }),
                prisma.prisma.invoice.count({
                    where: { company_id: companyId, status: "pending" },
                }),
                prisma.prisma.invoice.count({
                    where: {
                        company_id: companyId,
                        status: "overdue",
                        due_date: { lt: new Date() },
                    },
                }),
            ]);

            const stats = {
                customers: totalCustomers,
                products: totalProducts,
                invoices: totalInvoices,
                quotes: totalQuotes,
                users: totalUsers,
                revenue: totalRevenue._sum.amount_including_tax || 0,
                pending_invoices: pendingInvoices,
                overdue_invoices: overdueInvoices,
                updated_at: new Date(),
            };

            // Mettre en cache
            await cacheService.cacheStats("company", companyId, stats, 900); // 15 minutes

            return stats;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération des statistiques"
            );
            throw new CompanyError(
                "Erreur lors de la récupération des statistiques"
            );
        }
    }

    // Invalider le cache d'une entreprise
    private async invalidateCache(companyId: string): Promise<void> {
        try {
            await Promise.all([
                cacheService.invalidateCompany(companyId),
                cacheService.invalidateStats(companyId),
                cacheService.invalidateListCache("companies"),
            ]);
        } catch (error) {
            logger.warn(
                { error, companyId },
                "Erreur lors de l'invalidation du cache"
            );
        }
    }
}

export default new CompanyService();
