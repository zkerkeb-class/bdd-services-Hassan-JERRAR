import prisma from "../lib/prisma";
import cacheService from "../lib/redis";
import logger from "../utils/logger";
import companyService from "./company.service";
import invoiceService from "./invoice.service";
import {
    IQuote,
    ICreateQuoteRequest,
    IUpdateQuoteRequest,
    IQuoteQueryParams,
    IPaginatedQuotes,
    IQuoteStats,
    IQuoteConversion,
    IBulkQuoteAction,
} from "../interfaces/quote.interface";
import {
    QuoteError,
    NotFoundError,
    QuoteStatusError,
    ValidationError,
} from "../utils/customError";

class QuoteService {
    private cachePrefix = "quote";
    private cacheTTL = 1800; // 30 minutes

    // Créer un nouveau devis
    async createQuote(
        data: ICreateQuoteRequest,
        userId: string,
        companyId: string
    ): Promise<IQuote> {
        try {
            logger.info({ companyId, userId }, "Création d'un nouveau devis");

            // Générer le numéro de devis
            const quoteNumber = await companyService.getNextQuoteNumber(
                companyId
            );

            // Calculer les totaux
            const { totals, items } = this.calculateQuoteTotals(data.items);

            const quote = await prisma.prisma.$transaction(async (tx) => {
                // Créer le devis
                const newQuote = await tx.quote.create({
                    data: {
                        customer_id: data.customer_id,
                        user_id: userId,
                        company_id: companyId,
                        quote_number: quoteNumber,
                        reference: data.reference,
                        title: data.title,
                        quote_date: data.quote_date,
                        validity_date: data.validity_date,
                        amount_excluding_tax: totals.totalExcludingTax,
                        tax: totals.totalTax,
                        amount_including_tax: totals.totalIncludingTax,
                        discount_amount: data.discount_amount || 0,
                        discount_percentage: data.discount_percentage,
                        shipping_cost: data.shipping_cost || 0,
                        currency: data.currency || "EUR",
                        exchange_rate: data.exchange_rate,
                        conditions: data.conditions,
                        terms: data.terms,
                        notes: data.notes,
                        internal_notes: data.internal_notes,
                        language: data.language || "fr",
                        template_id: data.template_id,
                        meta_data: data.meta_data,
                    },
                });

                // Créer les lignes de devis
                await tx.quoteItem.createMany({
                    data: items.map((item, index) => ({
                        quote_id: newQuote.quote_id,
                        product_id: item.product_id,
                        name: item.name,
                        description: item.description,
                        quantity: item.quantity,
                        unit: item.unit,
                        unit_price_excluding_tax: item.unit_price_excluding_tax,
                        discount_percentage: item.discount_percentage,
                        discount_amount: item.discount_amount,
                        vat_rate: item.vat_rate,
                        total_excluding_tax: item.total_excluding_tax,
                        total_including_tax: item.total_including_tax,
                        sort_order: item.sort_order || index,
                    })),
                });

                return newQuote;
            });

            // Invalider le cache
            await this.invalidateCache(quote.quote_id, companyId);

            logger.info(
                { quoteId: quote.quote_id, quoteNumber },
                "Devis créé avec succès"
            );
            return await this.getQuoteById(quote.quote_id);
        } catch (error) {
            logger.error(
                { error, data },
                "Erreur lors de la création du devis"
            );
            throw new QuoteError("Erreur lors de la création du devis");
        }
    }

    // Récupérer un devis par ID
    async getQuoteById(quoteId: string): Promise<IQuote> {
        try {
            // Vérifier le cache
            const cacheKey = `${this.cachePrefix}:${quoteId}`;
            const cached = await cacheService.get<IQuote>(cacheKey);
            if (cached) {
                return cached;
            }

            const quote = await prisma.prisma.quote.findUnique({
                where: { quote_id: quoteId },
                include: {
                    items: {
                        orderBy: { sort_order: "asc" },
                        include: {
                            product: {
                                select: {
                                    product_id: true,
                                    name: true,
                                    sku: true,
                                },
                            },
                        },
                    },
                    customer: {
                        include: {
                            business: true,
                            individual: true,
                        },
                    },
                    company: {
                        select: {
                            company_id: true,
                            name: true,
                            siret: true,
                            address: true,
                            city: true,
                            postal_code: true,
                            email: true,
                            phone: true,
                            logo_url: true,
                        },
                    },
                },
            });

            if (!quote) {
                throw new NotFoundError("Devis", quoteId);
            }

            // Mettre en cache
            await cacheService.set(cacheKey, quote, this.cacheTTL);

            return quote as IQuote;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, quoteId },
                "Erreur lors de la récupération du devis"
            );
            throw new QuoteError("Erreur lors de la récupération du devis");
        }
    }

    // Mettre à jour un devis
    async updateQuote(
        quoteId: string,
        data: IUpdateQuoteRequest
    ): Promise<IQuote> {
        try {
            logger.info({ quoteId, data }, "Mise à jour du devis");

            // Vérifier que le devis existe
            const existingQuote = await this.getQuoteById(quoteId);

            // Vérifier le statut
            if (existingQuote.status === "accepted" && !data.status) {
                throw new QuoteStatusError(existingQuote.status, "modifier");
            }

            if (existingQuote.status === "converted") {
                throw new QuoteStatusError(existingQuote.status, "modifier");
            }

            let totals;
            let items;

            if (data.items) {
                const calculated = this.calculateQuoteTotals(data.items);
                totals = calculated.totals;
                items = calculated.items;
            }

            const quote = await prisma.prisma.$transaction(async (tx) => {
                // Mettre à jour le devis
                const updatedQuote = await tx.quote.update({
                    where: { quote_id: quoteId },
                    data: {
                        customer_id: data.customer_id,
                        reference: data.reference,
                        title: data.title,
                        quote_date: data.quote_date,
                        validity_date: data.validity_date,
                        amount_excluding_tax: totals?.totalExcludingTax,
                        tax: totals?.totalTax,
                        amount_including_tax: totals?.totalIncludingTax,
                        discount_amount: data.discount_amount,
                        discount_percentage: data.discount_percentage,
                        shipping_cost: data.shipping_cost,
                        status: data.status,
                        currency: data.currency,
                        exchange_rate: data.exchange_rate,
                        conditions: data.conditions,
                        terms: data.terms,
                        notes: data.notes,
                        internal_notes: data.internal_notes,
                        language: data.language,
                        template_id: data.template_id,
                        meta_data: data.meta_data,
                        // Mettre à jour les timestamps selon le statut
                        ...(data.status === "accepted" && {
                            accepted_at: new Date(),
                        }),
                        ...(data.status === "rejected" && {
                            rejected_at: new Date(),
                        }),
                        ...(data.status === "expired" && {
                            expired_at: new Date(),
                        }),
                    },
                });

                // Mettre à jour les lignes si fournies
                if (data.items && items) {
                    // Supprimer les anciennes lignes
                    await tx.quoteItem.deleteMany({
                        where: { quote_id: quoteId },
                    });

                    // Créer les nouvelles lignes
                    await tx.quoteItem.createMany({
                        data: items.map((item, index) => ({
                            quote_id: quoteId,
                            product_id: item.product_id,
                            name: item.name,
                            description: item.description,
                            quantity: item.quantity,
                            unit: item.unit,
                            unit_price_excluding_tax:
                                item.unit_price_excluding_tax,
                            discount_percentage: item.discount_percentage,
                            discount_amount: item.discount_amount,
                            vat_rate: item.vat_rate,
                            total_excluding_tax: item.total_excluding_tax,
                            total_including_tax: item.total_including_tax,
                            sort_order: item.sort_order || index,
                        })),
                    });
                }

                return updatedQuote;
            });

            // Invalider le cache
            await this.invalidateCache(quoteId, existingQuote.company_id!);

            logger.info({ quoteId }, "Devis mis à jour avec succès");
            return await this.getQuoteById(quoteId);
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof QuoteStatusError
            )
                throw error;
            logger.error(
                { error, quoteId, data },
                "Erreur lors de la mise à jour du devis"
            );
            throw new QuoteError("Erreur lors de la mise à jour du devis");
        }
    }

    // Supprimer un devis
    async deleteQuote(quoteId: string): Promise<void> {
        try {
            logger.info({ quoteId }, "Suppression du devis");

            // Vérifier que le devis existe
            const quote = await this.getQuoteById(quoteId);

            // Vérifier le statut
            if (quote.status === "accepted" || quote.status === "converted") {
                throw new QuoteStatusError(quote.status, "supprimer");
            }

            await prisma.prisma.quote.delete({
                where: { quote_id: quoteId },
            });

            // Invalider le cache
            await this.invalidateCache(quoteId, quote.company_id!);

            logger.info({ quoteId }, "Devis supprimé avec succès");
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof QuoteStatusError
            )
                throw error;
            logger.error(
                { error, quoteId },
                "Erreur lors de la suppression du devis"
            );
            throw new QuoteError("Erreur lors de la suppression du devis");
        }
    }

    // Lister les devis avec pagination et filtres
    async listQuotes(
        companyId: string,
        params: IQuoteQueryParams
    ): Promise<IPaginatedQuotes> {
        try {
            const {
                page = 1,
                limit = 10,
                search,
                customer_id,
                status,
                currency,
                date_from,
                date_to,
                validity_from,
                validity_to,
                amount_min,
                amount_max,
                expired_only,
                convertible_only,
                sortBy = "quote_date",
                sortOrder = "desc",
            } = params;

            const skip = (page - 1) * limit;
            const cacheKey = `quotes:list:${companyId}:${JSON.stringify(
                params
            )}`;

            // Vérifier le cache
            const cached = await cacheService.getCachedList<IPaginatedQuotes>(
                "quotes",
                cacheKey
            );
            if (cached) {
                return cached;
            }

            // Construire les filtres
            const where: any = { company_id: companyId };

            if (search) {
                where.OR = [
                    { quote_number: { contains: search, mode: "insensitive" } },
                    { reference: { contains: search, mode: "insensitive" } },
                    { title: { contains: search, mode: "insensitive" } },
                    { notes: { contains: search, mode: "insensitive" } },
                ];
            }

            if (customer_id) {
                where.customer_id = customer_id;
            }

            if (status && status.length > 0) {
                where.status = { in: status };
            }

            if (currency) {
                where.currency = currency;
            }

            if (date_from || date_to) {
                where.quote_date = {};
                if (date_from) where.quote_date.gte = date_from;
                if (date_to) where.quote_date.lte = date_to;
            }

            if (validity_from || validity_to) {
                where.validity_date = {};
                if (validity_from) where.validity_date.gte = validity_from;
                if (validity_to) where.validity_date.lte = validity_to;
            }

            if (amount_min || amount_max) {
                where.amount_including_tax = {};
                if (amount_min) where.amount_including_tax.gte = amount_min;
                if (amount_max) where.amount_including_tax.lte = amount_max;
            }

            if (expired_only) {
                where.validity_date = { lt: new Date() };
                where.status = { not: "accepted" };
            }

            if (convertible_only) {
                where.status = "accepted";
                where.converted_to_invoice = false;
            }

            // Exécuter les requêtes en parallèle
            const [quotes, total, summary] = await Promise.all([
                prisma.prisma.quote.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { [sortBy]: sortOrder },
                    include: {
                        customer: {
                            include: {
                                business: { select: { name: true } },
                                individual: {
                                    select: {
                                        first_name: true,
                                        last_name: true,
                                    },
                                },
                            },
                        },
                        _count: {
                            select: {
                                items: true,
                            },
                        },
                    },
                }),
                prisma.prisma.quote.count({ where }),
                this.getQuotesSummary(where),
            ]);

            const result: IPaginatedQuotes = {
                quotes: quotes as IQuote[],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPreviousPage: page > 1,
                summary,
            };

            // Mettre en cache
            await cacheService.cacheList("quotes", cacheKey, result, 600); // 10 minutes

            return result;
        } catch (error) {
            logger.error(
                { error, companyId, params },
                "Erreur lors de la récupération des devis"
            );
            throw new QuoteError("Erreur lors de la récupération des devis");
        }
    }

    // Marquer un devis comme envoyé
    async markAsSent(quoteId: string): Promise<IQuote> {
        try {
            const quote = await this.getQuoteById(quoteId);

            if (quote.status !== "draft" && quote.status !== "pending") {
                throw new QuoteStatusError(
                    quote.status,
                    "marquer comme envoyé"
                );
            }

            await prisma.prisma.quote.update({
                where: { quote_id: quoteId },
                data: {
                    status: "sent",
                    sent_at: new Date(),
                },
            });

            await this.invalidateCache(quoteId, quote.company_id!);

            logger.info({ quoteId }, "Devis marqué comme envoyé");
            return await this.getQuoteById(quoteId);
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof QuoteStatusError
            )
                throw error;
            throw new QuoteError("Erreur lors du marquage comme envoyé");
        }
    }

    // Marquer un devis comme accepté
    async markAsAccepted(quoteId: string): Promise<IQuote> {
        try {
            const quote = await this.getQuoteById(quoteId);

            if (quote.status === "accepted") {
                throw new QuoteStatusError(
                    quote.status,
                    "marquer comme accepté"
                );
            }

            if (quote.validity_date < new Date()) {
                throw new QuoteStatusError("expired", "accepter");
            }

            await prisma.prisma.quote.update({
                where: { quote_id: quoteId },
                data: {
                    status: "accepted",
                    accepted_at: new Date(),
                },
            });

            await this.invalidateCache(quoteId, quote.company_id!);

            logger.info({ quoteId }, "Devis marqué comme accepté");
            return await this.getQuoteById(quoteId);
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof QuoteStatusError
            )
                throw error;
            throw new QuoteError("Erreur lors du marquage comme accepté");
        }
    }

    // Convertir un devis en facture
    async convertToInvoice(
        quoteId: string,
        conversionData: IQuoteConversion
    ): Promise<{ quote: IQuote; invoice: any }> {
        try {
            logger.info(
                { quoteId, conversionData },
                "Conversion devis en facture"
            );

            const quote = await this.getQuoteById(quoteId);

            if (quote.status !== "accepted") {
                throw new QuoteStatusError(
                    quote.status,
                    "convertir en facture"
                );
            }

            if (quote.converted_to_invoice) {
                throw new QuoteStatusError(
                    "already converted",
                    "convertir à nouveau"
                );
            }

            const result = await prisma.prisma.$transaction(async (tx) => {
                // Préparer les données de la facture
                const invoiceData = {
                    customer_id: quote.customer_id,
                    invoice_date: conversionData.invoice_date || new Date(),
                    due_date:
                        conversionData.due_date ||
                        new Date(
                            Date.now() +
                                (conversionData.payment_terms || 30) *
                                    24 *
                                    60 *
                                    60 *
                                    1000
                        ),
                    discount_amount: quote.discount_amount?.toNumber(),
                    discount_percentage: quote.discount_percentage?.toNumber(),
                    shipping_cost: quote.shipping_cost?.toNumber(),
                    currency: quote.currency,
                    exchange_rate: quote.exchange_rate?.toNumber(),
                    conditions: quote.conditions,
                    notes: conversionData.notes || quote.notes,
                    language: quote.language,
                    template_id: quote.template_id,
                    items:
                        quote.items?.map((item) => ({
                            product_id: item.product_id,
                            name: item.name || "",
                            description: item.description,
                            quantity: item.quantity.toNumber(),
                            unit: item.unit,
                            unit_price_excluding_tax:
                                conversionData.apply_current_prices
                                    ? item.unit_price_excluding_tax.toNumber() // Utiliser les prix actuels du produit si demandé
                                    : item.unit_price_excluding_tax.toNumber(),
                            discount_percentage:
                                item.discount_percentage?.toNumber(),
                            discount_amount: item.discount_amount?.toNumber(),
                            vat_rate: item.vat_rate,
                            sort_order: item.sort_order,
                        })) || [],
                };

                // Créer la facture via le service des factures
                // Note: Nous devons importer le service ici pour éviter les dépendances circulaires
                const invoice = await invoiceService.createInvoice(
                    invoiceData as any,
                    quote.user_id,
                    quote.company_id!
                );

                // Marquer le devis comme converti
                const updatedQuote = await tx.quote.update({
                    where: { quote_id: quoteId },
                    data: {
                        status: "converted",
                        converted_to_invoice: true,
                        invoice_id: invoice.invoice_id,
                    },
                });

                return { quote: updatedQuote, invoice };
            });

            await this.invalidateCache(quoteId, quote.company_id!);

            logger.info(
                { quoteId, invoiceId: result.invoice.invoice_id },
                "Devis converti en facture avec succès"
            );
            return result;
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof QuoteStatusError
            )
                throw error;
            logger.error(
                { error, quoteId, conversionData },
                "Erreur lors de la conversion en facture"
            );
            throw new QuoteError("Erreur lors de la conversion en facture");
        }
    }

    // Obtenir les statistiques des devis
    async getQuoteStats(companyId: string): Promise<IQuoteStats> {
        try {
            const cacheKey = `${this.cachePrefix}:stats:${companyId}`;
            const cached = await cacheService.getCachedStats(
                "quote",
                companyId
            );
            if (cached) {
                return cached;
            }

            const [
                totalQuotes,
                totalAmount,
                acceptedAmount,
                pendingAmount,
                expiredAmount,
                acceptanceRate,
                conversionRate,
                statusDistribution,
                monthlyStats,
            ] = await Promise.all([
                prisma.prisma.quote.count({ where: { company_id: companyId } }),
                this.getTotalAmount(companyId),
                this.getAcceptedAmount(companyId),
                this.getPendingAmount(companyId),
                this.getExpiredAmount(companyId),
                this.getAcceptanceRate(companyId),
                this.getConversionRate(companyId),
                this.getStatusDistribution(companyId),
                this.getMonthlyStats(companyId),
            ]);

            const stats: IQuoteStats = {
                total_quotes: totalQuotes,
                total_amount: totalAmount,
                accepted_amount: acceptedAmount,
                pending_amount: pendingAmount,
                expired_amount: expiredAmount,
                average_amount: totalQuotes > 0 ? totalAmount / totalQuotes : 0,
                acceptance_rate: acceptanceRate,
                conversion_rate: conversionRate,
                average_response_time: await this.getAverageResponseTime(
                    companyId
                ),
                status_distribution: statusDistribution,
                monthly_stats: monthlyStats,
            };

            // Mettre en cache
            await cacheService.cacheStats("quote", companyId, stats, 900); // 15 minutes

            return stats;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération des statistiques devis"
            );
            throw new QuoteError(
                "Erreur lors de la récupération des statistiques devis"
            );
        }
    }

    // Actions en lot
    async bulkAction(
        action: IBulkQuoteAction
    ): Promise<{ success: number; failed: number; errors: any[] }> {
        try {
            logger.info(
                { action: action.action, count: action.quote_ids.length },
                "Action en lot sur les devis"
            );

            const results = { success: 0, failed: 0, errors: [] as any[] };

            for (const quoteId of action.quote_ids) {
                try {
                    switch (action.action) {
                        case "send":
                            await this.markAsSent(quoteId);
                            break;
                        case "mark_accepted":
                            await this.markAsAccepted(quoteId);
                            break;
                        case "mark_rejected":
                            await this.updateQuote(quoteId, {
                                status: "rejected",
                                rejected_at: new Date(),
                            } as any);
                            break;
                        case "mark_expired":
                            await this.updateQuote(quoteId, {
                                status: "expired",
                                expired_at: new Date(),
                            } as any);
                            break;
                        case "convert_to_invoice":
                            if (action.options?.conversion_settings) {
                                await this.convertToInvoice(
                                    quoteId,
                                    action.options.conversion_settings
                                );
                            }
                            break;
                        case "delete":
                            await this.deleteQuote(quoteId);
                            break;
                        default:
                            throw new ValidationError(
                                `Action non supportée: ${action.action}`,
                                {}
                            );
                    }
                    results.success++;
                } catch (error) {
                    results.failed++;
                    results.errors.push({ quoteId, error: error.message });
                }
            }

            return results;
        } catch (error) {
            logger.error({ error, action }, "Erreur lors de l'action en lot");
            throw new QuoteError("Erreur lors de l'action en lot");
        }
    }

    // Méthodes utilitaires privées

    private calculateQuoteTotals(itemsData: any[]) {
        const items = itemsData.map((item) => {
            const lineTotal = item.quantity * item.unit_price_excluding_tax;
            const discountAmount = item.discount_percentage
                ? (lineTotal * item.discount_percentage) / 100
                : item.discount_amount || 0;
            const totalExcludingTax = lineTotal - discountAmount;
            const vatRate = this.getVatRateValue(item.vat_rate);
            const vatAmount = (totalExcludingTax * vatRate) / 100;
            const totalIncludingTax = totalExcludingTax + vatAmount;

            return {
                ...item,
                total_excluding_tax: totalExcludingTax,
                total_including_tax: totalIncludingTax,
            };
        });

        const totalExcludingTax = items.reduce(
            (sum, item) => sum + item.total_excluding_tax,
            0
        );
        const totalTax = items.reduce(
            (sum, item) =>
                sum + (item.total_including_tax - item.total_excluding_tax),
            0
        );
        const totalIncludingTax = items.reduce(
            (sum, item) => sum + item.total_including_tax,
            0
        );

        return {
            items,
            totals: {
                totalExcludingTax,
                totalTax,
                totalIncludingTax,
            },
        };
    }

    private getVatRateValue(vatRate: string): number {
        const rates: Record<string, number> = {
            ZERO: 0,
            REDUCED_1: 2.1,
            REDUCED_2: 5.5,
            REDUCED_3: 10.0,
            STANDARD: 20.0,
            EXPORT: 0,
        };
        return rates[vatRate] || 20.0;
    }

    private async getQuotesSummary(where: any) {
        const [amounts, statusCounts] = await Promise.all([
            prisma.prisma.quote.aggregate({
                where,
                _sum: {
                    amount_including_tax: true,
                    amount_excluding_tax: true,
                    tax: true,
                },
            }),
            prisma.prisma.quote.groupBy({
                by: ["status"],
                where,
                _count: { status: true },
            }),
        ]);

        return {
            total_amount: amounts._sum.amount_including_tax?.toNumber() || 0,
            accepted_amount: 0, // À calculer séparément
            pending_amount: 0, // À calculer séparément
            expired_amount: 0, // À calculer séparément
            count_by_status: statusCounts.reduce((acc, item) => {
                acc[item.status] = item._count.status;
                return acc;
            }, {} as Record<string, number>),
        };
    }

    // Méthodes utilitaires pour les statistiques
    private async getTotalAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.quote.aggregate({
            where: { company_id: companyId },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getAcceptedAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.quote.aggregate({
            where: { company_id: companyId, status: "accepted" },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getPendingAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.quote.aggregate({
            where: {
                company_id: companyId,
                status: { in: ["draft", "pending", "sent", "viewed"] },
            },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getExpiredAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.quote.aggregate({
            where: {
                company_id: companyId,
                OR: [
                    { status: "expired" },
                    {
                        validity_date: { lt: new Date() },
                        status: { not: "accepted" },
                    },
                ],
            },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getAcceptanceRate(companyId: string): Promise<number> {
        const [total, accepted] = await Promise.all([
            prisma.prisma.quote.count({
                where: {
                    company_id: companyId,
                    status: { not: "draft" },
                },
            }),
            prisma.prisma.quote.count({
                where: {
                    company_id: companyId,
                    status: "accepted",
                },
            }),
        ]);

        return total > 0 ? (accepted / total) * 100 : 0;
    }

    private async getConversionRate(companyId: string): Promise<number> {
        const [accepted, converted] = await Promise.all([
            prisma.prisma.quote.count({
                where: {
                    company_id: companyId,
                    status: "accepted",
                },
            }),
            prisma.prisma.quote.count({
                where: {
                    company_id: companyId,
                    converted_to_invoice: true,
                },
            }),
        ]);

        return accepted > 0 ? (converted / accepted) * 100 : 0;
    }

    private async getStatusDistribution(
        companyId: string
    ): Promise<Record<string, number>> {
        const result = await prisma.prisma.quote.groupBy({
            by: ["status"],
            where: { company_id: companyId },
            _count: { status: true },
        });

        return result.reduce((acc, item) => {
            acc[item.status] = item._count.status;
            return acc;
        }, {} as Record<string, number>);
    }

    private async getMonthlyStats(companyId: string): Promise<any[]> {
        // Implémentation simplifiée - à améliorer selon les besoins
        return [];
    }

    private async getAverageResponseTime(companyId: string): Promise<number> {
        const quotes = await prisma.prisma.quote.findMany({
            where: {
                company_id: companyId,
                sent_at: { not: null },
                OR: [
                    { accepted_at: { not: null } },
                    { rejected_at: { not: null } },
                ],
            },
            select: {
                sent_at: true,
                accepted_at: true,
                rejected_at: true,
            },
        });

        if (quotes.length === 0) return 0;

        const totalResponseTime = quotes.reduce((sum, quote) => {
            const responseDate = quote.accepted_at || quote.rejected_at;
            if (quote.sent_at && responseDate) {
                const responseTime =
                    (responseDate.getTime() - quote.sent_at.getTime()) /
                    (1000 * 60 * 60 * 24);
                return sum + responseTime;
            }
            return sum;
        }, 0);

        return Math.round(totalResponseTime / quotes.length);
    }

    // Invalider le cache d'un devis
    private async invalidateCache(
        quoteId: string,
        companyId: string
    ): Promise<void> {
        try {
            await Promise.all([
                cacheService.invalidateQuote(quoteId),
                cacheService.invalidateStats(companyId),
                cacheService.invalidateListCache("quotes"),
            ]);
        } catch (error) {
            logger.warn(
                { error, quoteId },
                "Erreur lors de l'invalidation du cache"
            );
        }
    }
}

export default new QuoteService();
