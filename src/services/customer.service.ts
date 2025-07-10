import prisma from "../lib/prisma";
import cacheService from "../lib/redis";
import logger from "../utils/logger";
import {
    ICustomer,
    ICreateCustomerRequest,
    IUpdateCustomerRequest,
    ICustomerQueryParams,
    IPaginatedCustomers,
    ICustomerStats,
    ICustomerActivity,
} from "../interfaces/customer.interface";
import {
    CustomerError,
    NotFoundError,
    DuplicateError,
    ValidationError,
} from "../utils/customError";

class CustomerService {
    private cachePrefix = "customer";
    private cacheTTL = 3600; // 1 heure

    // Créer un nouveau client
    async createCustomer(
        data: ICreateCustomerRequest,
        userId: string,
        companyId: string
    ): Promise<ICustomer> {
        try {
            logger.info(
                { type: data.type, companyId },
                "Création d'un nouveau client"
            );

            // Vérifier l'unicité de l'email s'il est fourni
            if (data.email) {
                const existingCustomer = await prisma.prisma.customer.findFirst(
                    {
                        where: {
                            company_id: companyId,
                            email: data.email,
                            is_active: true,
                        },
                    }
                );

                if (existingCustomer) {
                    throw new DuplicateError("email", data.email);
                }
            }

            // Validation selon le type de client
            if (data.type === "company" && !data.business) {
                throw new ValidationError(
                    "Les informations entreprise sont requises pour un client entreprise",
                    {}
                );
            }

            if (data.type === "individual" && !data.individual) {
                throw new ValidationError(
                    "Les informations particulier sont requises pour un client particulier",
                    {}
                );
            }

            const customer = await prisma.prisma.$transaction(async (tx) => {
                // Créer le client principal
                const newCustomer = await tx.customer.create({
                    data: {
                        user_id: userId,
                        company_id: companyId,
                        type: data.type,
                        email: data.email,
                        phone: data.phone,
                        address: data.address,
                        city: data.city,
                        postal_code: data.postal_code,
                        country: data.country || "France",
                        notes: data.notes,
                        tags: data.tags || [],
                        preferred_language: data.preferred_language || "fr",
                        payment_terms: data.payment_terms || 30,
                        credit_limit: data.credit_limit,
                        tax_exempt: data.tax_exempt || false,
                    },
                });

                // Créer les informations spécifiques selon le type
                if (data.type === "company" && data.business) {
                    await tx.businessCustomer.create({
                        data: {
                            customer_id: newCustomer.customer_id,
                            ...data.business,
                        },
                    });
                }

                if (data.type === "individual" && data.individual) {
                    await tx.individualCustomer.create({
                        data: {
                            customer_id: newCustomer.customer_id,
                            ...data.individual,
                        },
                    });
                }

                return newCustomer;
            });

            // Invalider le cache
            await this.invalidateCache(customer.customer_id, companyId);

            logger.info(
                { customerId: customer.customer_id },
                "Client créé avec succès"
            );
            return await this.getCustomerById(customer.customer_id);
        } catch (error) {
            logger.error(
                { error, data },
                "Erreur lors de la création du client"
            );
            if (
                error instanceof ValidationError ||
                error instanceof DuplicateError
            )
                throw error;
            throw new CustomerError("Erreur lors de la création du client");
        }
    }

    // Récupérer un client par ID
    async getCustomerById(customerId: string): Promise<ICustomer> {
        try {
            // Vérifier le cache
            const cacheKey = `${this.cachePrefix}:${customerId}`;
            const cached = await cacheService.get<ICustomer>(cacheKey);
            if (cached) {
                return cached;
            }

            const customer = await prisma.prisma.customer.findUnique({
                where: { customer_id: customerId },
                include: {
                    business: true,
                    individual: true,
                    _count: {
                        select: {
                            invoices: true,
                            quotes: true,
                        },
                    },
                },
            });

            if (!customer) {
                throw new NotFoundError("Client", customerId);
            }

            // Mettre en cache
            await cacheService.set(cacheKey, customer, this.cacheTTL);

            return customer as ICustomer;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, customerId },
                "Erreur lors de la récupération du client"
            );
            throw new CustomerError("Erreur lors de la récupération du client");
        }
    }

    // Mettre à jour un client
    async updateCustomer(
        customerId: string,
        data: IUpdateCustomerRequest
    ): Promise<ICustomer> {
        try {
            logger.info({ customerId, data }, "Mise à jour du client");

            // Vérifier que le client existe
            const existingCustomer = await this.getCustomerById(customerId);

            // Vérifier l'unicité de l'email s'il est modifié
            if (data.email && data.email !== existingCustomer.email) {
                const duplicateCustomer =
                    await prisma.prisma.customer.findFirst({
                        where: {
                            company_id: existingCustomer.company_id,
                            email: data.email,
                            customer_id: { not: customerId },
                            is_active: true,
                        },
                    });

                if (duplicateCustomer) {
                    throw new DuplicateError("email", data.email);
                }
            }

            const customer = await prisma.prisma.$transaction(async (tx) => {
                // Mettre à jour le client principal
                const updatedCustomer = await tx.customer.update({
                    where: { customer_id: customerId },
                    data: {
                        email: data.email,
                        phone: data.phone,
                        address: data.address,
                        city: data.city,
                        postal_code: data.postal_code,
                        country: data.country,
                        notes: data.notes,
                        tags: data.tags,
                        is_active: data.is_active,
                        preferred_language: data.preferred_language,
                        payment_terms: data.payment_terms,
                        credit_limit: data.credit_limit,
                        tax_exempt: data.tax_exempt,
                    },
                });

                // Mettre à jour les informations spécifiques
                if (existingCustomer.type === "company" && data.business) {
                    await tx.businessCustomer.upsert({
                        where: { customer_id: customerId },
                        update: data.business,
                        create: {
                            customer_id: customerId,
                            ...data.business,
                            // Valeurs par défaut si non fournies
                            name: data.business.name || "Entreprise",
                            siret: data.business.siret || "",
                            siren: data.business.siren || "",
                            tva_applicable:
                                data.business.tva_applicable ?? true,
                        },
                    });
                }

                if (existingCustomer.type === "individual" && data.individual) {
                    await tx.individualCustomer.upsert({
                        where: { customer_id: customerId },
                        update: data.individual,
                        create: {
                            customer_id: customerId,
                            ...data.individual,
                            // Valeurs par défaut si non fournies
                            first_name: data.individual.first_name || "Prénom",
                            last_name: data.individual.last_name || "Nom",
                        },
                    });
                }

                return updatedCustomer;
            });

            // Invalider le cache
            await this.invalidateCache(customerId, existingCustomer.company_id);

            logger.info({ customerId }, "Client mis à jour avec succès");
            return await this.getCustomerById(customerId);
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof DuplicateError
            )
                throw error;
            logger.error(
                { error, customerId, data },
                "Erreur lors de la mise à jour du client"
            );
            throw new CustomerError("Erreur lors de la mise à jour du client");
        }
    }

    // Supprimer un client (soft delete)
    async deleteCustomer(customerId: string): Promise<void> {
        try {
            logger.info({ customerId }, "Suppression du client");

            // Vérifier que le client existe
            const customer = await this.getCustomerById(customerId);

            // Vérifier qu'il n'y a pas de factures ou devis associés
            const [invoiceCount, quoteCount] = await Promise.all([
                prisma.prisma.invoice.count({
                    where: { customer_id: customerId },
                }),
                prisma.prisma.quote.count({
                    where: { customer_id: customerId },
                }),
            ]);

            if (invoiceCount > 0 || quoteCount > 0) {
                // Soft delete si des documents existent
                await prisma.prisma.customer.update({
                    where: { customer_id: customerId },
                    data: { is_active: false },
                });
            } else {
                // Hard delete si aucun document
                await prisma.prisma.customer.delete({
                    where: { customer_id: customerId },
                });
            }

            // Invalider le cache
            await this.invalidateCache(customerId, customer.company_id);

            logger.info({ customerId }, "Client supprimé avec succès");
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, customerId },
                "Erreur lors de la suppression du client"
            );
            throw new CustomerError("Erreur lors de la suppression du client");
        }
    }

    // Lister les clients avec pagination et filtres
    async listCustomers(
        companyId: string,
        params: ICustomerQueryParams
    ): Promise<IPaginatedCustomers> {
        try {
            const {
                page = 1,
                limit = 10,
                search,
                type,
                tags,
                is_active,
                payment_terms,
                tax_exempt,
                city,
                country,
                sortBy = "createdAt",
                sortOrder = "desc",
            } = params;

            const skip = (page - 1) * limit;
            const cacheKey = `customers:list:${companyId}:${JSON.stringify(
                params
            )}`;

            // Vérifier le cache
            const cached =
                await cacheService.getCachedList<IPaginatedCustomers>(
                    "customers",
                    cacheKey
                );
            if (cached) {
                return cached;
            }

            // Construire les filtres
            const where: any = { company_id: companyId };

            if (search) {
                where.OR = [
                    { email: { contains: search, mode: "insensitive" } },
                    { phone: { contains: search } },
                    { address: { contains: search, mode: "insensitive" } },
                    { city: { contains: search, mode: "insensitive" } },
                    {
                        business: {
                            name: { contains: search, mode: "insensitive" },
                        },
                    },
                    {
                        individual: {
                            OR: [
                                {
                                    first_name: {
                                        contains: search,
                                        mode: "insensitive",
                                    },
                                },
                                {
                                    last_name: {
                                        contains: search,
                                        mode: "insensitive",
                                    },
                                },
                            ],
                        },
                    },
                ];
            }

            if (type) {
                where.type = type;
            }

            if (tags && tags.length > 0) {
                where.tags = { hasSome: tags };
            }

            if (typeof is_active === "boolean") {
                where.is_active = is_active;
            }

            if (payment_terms) {
                where.payment_terms = payment_terms;
            }

            if (typeof tax_exempt === "boolean") {
                where.tax_exempt = tax_exempt;
            }

            if (city) {
                where.city = { contains: city, mode: "insensitive" };
            }

            if (country) {
                where.country = { contains: country, mode: "insensitive" };
            }

            // Exécuter les requêtes en parallèle
            const [customers, total] = await Promise.all([
                prisma.prisma.customer.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { [sortBy]: sortOrder },
                    include: {
                        business: true,
                        individual: true,
                        _count: {
                            select: {
                                invoices: true,
                                quotes: true,
                            },
                        },
                    },
                }),
                prisma.prisma.customer.count({ where }),
            ]);

            const result: IPaginatedCustomers = {
                customers: customers as ICustomer[],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPreviousPage: page > 1,
            };

            // Mettre en cache
            await cacheService.cacheList("customers", cacheKey, result, 600); // 10 minutes

            return result;
        } catch (error) {
            logger.error(
                { error, companyId, params },
                "Erreur lors de la récupération des clients"
            );
            throw new CustomerError(
                "Erreur lors de la récupération des clients"
            );
        }
    }

    // Obtenir les statistiques des clients
    async getCustomerStats(companyId: string): Promise<ICustomerStats> {
        try {
            const cacheKey = `${this.cachePrefix}:stats:${companyId}`;
            const cached = await cacheService.getCachedStats(
                "customer",
                companyId
            );
            if (cached) {
                return cached;
            }

            const [
                total,
                individual,
                company,
                active,
                thisMonth,
                topCustomers,
            ] = await Promise.all([
                prisma.prisma.customer.count({
                    where: { company_id: companyId },
                }),
                prisma.prisma.customer.count({
                    where: { company_id: companyId, type: "individual" },
                }),
                prisma.prisma.customer.count({
                    where: { company_id: companyId, type: "company" },
                }),
                prisma.prisma.customer.count({
                    where: { company_id: companyId, is_active: true },
                }),
                prisma.prisma.customer.count({
                    where: {
                        company_id: companyId,
                        createdAt: {
                            gte: new Date(
                                new Date().getFullYear(),
                                new Date().getMonth(),
                                1
                            ),
                        },
                    },
                }),
                this.getTopCustomers(companyId),
            ]);

            const stats: ICustomerStats = {
                total,
                individual,
                company,
                active,
                inactive: total - active,
                new_this_month: thisMonth,
                top_customers: topCustomers,
            };

            // Mettre en cache
            await cacheService.cacheStats("customer", companyId, stats, 900); // 15 minutes

            return stats;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération des statistiques clients"
            );
            throw new CustomerError(
                "Erreur lors de la récupération des statistiques clients"
            );
        }
    }

    // Obtenir l'activité d'un client
    async getCustomerActivity(customerId: string): Promise<ICustomerActivity> {
        try {
            const [invoices, quotes, payments, overdueInvoices] =
                await Promise.all([
                    prisma.prisma.invoice.findMany({
                        where: { customer_id: customerId },
                        select: {
                            amount_including_tax: true,
                            invoice_date: true,
                            due_date: true,
                            payment_status: true,
                            paid_at: true,
                        },
                    }),
                    prisma.prisma.quote.count({
                        where: { customer_id: customerId },
                    }),
                    prisma.prisma.payment.findMany({
                        where: {
                            invoice: { customer_id: customerId },
                        },
                        select: {
                            payment_date: true,
                            amount: true,
                        },
                    }),
                    prisma.prisma.invoice.count({
                        where: {
                            customer_id: customerId,
                            status: "overdue",
                            due_date: { lt: new Date() },
                        },
                    }),
                ]);

            const totalRevenue = invoices
                .filter((inv) => inv.payment_status === "paid")
                .reduce(
                    (sum, inv) => sum + inv.amount_including_tax.toNumber(),
                    0
                );

            const lastInvoiceDate =
                invoices.length > 0
                    ? new Date(
                          Math.max(
                              ...invoices.map((inv) =>
                                  inv.invoice_date.getTime()
                              )
                          )
                      )
                    : undefined;

            const lastPaymentDate =
                payments.length > 0
                    ? new Date(
                          Math.max(
                              ...payments.map((pay) =>
                                  pay.payment_date.getTime()
                              )
                          )
                      )
                    : undefined;

            // Calculer le délai moyen de paiement
            const paidInvoices = invoices.filter((inv) => inv.paid_at);
            const averagePaymentDelay =
                paidInvoices.length > 0
                    ? paidInvoices.reduce((sum, inv) => {
                          const delay =
                              (inv.paid_at!.getTime() -
                                  inv.due_date.getTime()) /
                              (1000 * 60 * 60 * 24);
                          return sum + delay;
                      }, 0) / paidInvoices.length
                    : 0;

            return {
                customer_id: customerId,
                total_invoices: invoices.length,
                total_quotes: quotes,
                total_revenue: totalRevenue,
                last_invoice_date: lastInvoiceDate,
                last_payment_date: lastPaymentDate,
                average_payment_delay: Math.round(averagePaymentDelay),
                overdue_invoices: overdueInvoices,
                last_quote_date: undefined, // À implémenter si nécessaire
            };
        } catch (error) {
            logger.error(
                { error, customerId },
                "Erreur lors de la récupération de l'activité client"
            );
            throw new CustomerError(
                "Erreur lors de la récupération de l'activité client"
            );
        }
    }

    // Obtenir les meilleurs clients
    private async getTopCustomers(companyId: string): Promise<any[]> {
        try {
            const result = await prisma.prisma.customer.findMany({
                where: { company_id: companyId, is_active: true },
                include: {
                    invoices: {
                        where: { payment_status: "paid" },
                        select: { amount_including_tax: true },
                    },
                    business: { select: { name: true } },
                    individual: {
                        select: { first_name: true, last_name: true },
                    },
                    _count: { select: { invoices: true } },
                },
                take: 10,
            });

            return result
                .map((customer) => ({
                    customer_id: customer.customer_id,
                    name:
                        customer.type === "company"
                            ? customer.business?.name || "Entreprise"
                            : `${customer.individual?.first_name || ""} ${
                                  customer.individual?.last_name || ""
                              }`.trim(),
                    total_revenue: customer.invoices.reduce(
                        (sum, inv) => sum + inv.amount_including_tax.toNumber(),
                        0
                    ),
                    invoice_count: customer._count.invoices,
                }))
                .sort((a, b) => b.total_revenue - a.total_revenue)
                .slice(0, 5);
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération des meilleurs clients"
            );
            return [];
        }
    }

    // Invalider le cache d'un client
    private async invalidateCache(
        customerId: string,
        companyId: string
    ): Promise<void> {
        try {
            await Promise.all([
                cacheService.invalidateCustomer(customerId),
                cacheService.invalidateStats(companyId),
                cacheService.invalidateListCache("customers"),
            ]);
        } catch (error) {
            logger.warn(
                { error, customerId },
                "Erreur lors de l'invalidation du cache"
            );
        }
    }
}

export default new CustomerService();
