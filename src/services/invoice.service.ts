import prisma from "../lib/prisma";
import cacheService from "../lib/redis";
import logger from "../utils/logger";
import companyService from "./company.service";
import {
    IInvoice,
    ICreateInvoiceRequest,
    IUpdateInvoiceRequest,
    IInvoiceQueryParams,
    IPaginatedInvoices,
    IInvoiceStats,
    IBulkInvoiceAction,
} from "../interfaces/invoice.interface";
import {
    InvoiceError,
    NotFoundError,
    InvoiceStatusError,
    ValidationError,
} from "../utils/customError";

class InvoiceService {
    private cachePrefix = "invoice";
    private cacheTTL = 1800; // 30 minutes

    // Créer une nouvelle facture
    async createInvoice(
        data: ICreateInvoiceRequest,
        userId: string,
        companyId: string
    ): Promise<IInvoice> {
        try {
            logger.info(
                { companyId, userId },
                "Création d'une nouvelle facture"
            );

            // Générer le numéro de facture
            const invoiceNumber = await companyService.getNextInvoiceNumber(
                companyId
            );

            // Calculer les totaux
            const { totals, items } = this.calculateInvoiceTotals(data.items);

            const invoice = await prisma.prisma.$transaction(async (tx) => {
                // Créer la facture
                const newInvoice = await tx.invoice.create({
                    data: {
                        customer_id: data.customer_id,
                        user_id: userId,
                        company_id: companyId,
                        invoice_number: invoiceNumber,
                        reference: data.reference,
                        invoice_date: data.invoice_date,
                        due_date: data.due_date,
                        amount_excluding_tax: totals.totalExcludingTax,
                        tax: totals.totalTax,
                        amount_including_tax: totals.totalIncludingTax,
                        discount_amount: data.discount_amount || 0,
                        discount_percentage: data.discount_percentage,
                        shipping_cost: data.shipping_cost || 0,
                        currency: data.currency || "EUR",
                        exchange_rate: data.exchange_rate,
                        conditions: data.conditions,
                        late_payment_penalty: data.late_payment_penalty,
                        notes: data.notes,
                        internal_notes: data.internal_notes,
                        language: data.language || "fr",
                        template_id: data.template_id,
                        meta_data: data.meta_data,
                    },
                });

                // Créer les lignes de facture
                await tx.invoiceItem.createMany({
                    data: items.map((item, index) => ({
                        invoice_id: newInvoice.invoice_id,
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

                return newInvoice;
            });

            // Invalider le cache
            await this.invalidateCache(invoice.invoice_id, companyId);

            logger.info(
                { invoiceId: invoice.invoice_id, invoiceNumber },
                "Facture créée avec succès"
            );
            return await this.getInvoiceById(invoice.invoice_id);
        } catch (error) {
            logger.error(
                { error, data },
                "Erreur lors de la création de la facture"
            );
            throw new InvoiceError("Erreur lors de la création de la facture");
        }
    }

    // Récupérer une facture par ID
    async getInvoiceById(invoiceId: string): Promise<IInvoice> {
        try {
            // Vérifier le cache
            const cacheKey = `${this.cachePrefix}:${invoiceId}`;
            const cached = await cacheService.get<IInvoice>(cacheKey);
            if (cached) {
                return cached;
            }

            const invoice = await prisma.prisma.invoice.findUnique({
                where: { invoice_id: invoiceId },
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
                    payments: {
                        orderBy: { payment_date: "desc" },
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

            if (!invoice) {
                throw new NotFoundError("Facture", invoiceId);
            }

            // Mettre en cache
            await cacheService.set(cacheKey, invoice, this.cacheTTL);

            return invoice as IInvoice;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, invoiceId },
                "Erreur lors de la récupération de la facture"
            );
            throw new InvoiceError(
                "Erreur lors de la récupération de la facture"
            );
        }
    }

    // Mettre à jour une facture
    async updateInvoice(
        invoiceId: string,
        data: IUpdateInvoiceRequest
    ): Promise<IInvoice> {
        try {
            logger.info({ invoiceId, data }, "Mise à jour de la facture");

            // Vérifier que la facture existe
            const existingInvoice = await this.getInvoiceById(invoiceId);

            // Vérifier le statut (certaines modifications interdites selon le statut)
            if (
                existingInvoice.status === "paid" &&
                (data.items || data.amount_excluding_tax)
            ) {
                throw new InvoiceStatusError(
                    existingInvoice.status,
                    "modifier les montants"
                );
            }

            if (existingInvoice.status === "cancelled") {
                throw new InvoiceStatusError(
                    existingInvoice.status,
                    "modifier"
                );
            }

            let totals;
            let items;

            if (data.items) {
                const calculated = this.calculateInvoiceTotals(data.items);
                totals = calculated.totals;
                items = calculated.items;
            }

            const invoice = await prisma.prisma.$transaction(async (tx) => {
                // Mettre à jour la facture
                const updatedInvoice = await tx.invoice.update({
                    where: { invoice_id: invoiceId },
                    data: {
                        customer_id: data.customer_id,
                        reference: data.reference,
                        invoice_date: data.invoice_date,
                        due_date: data.due_date,
                        amount_excluding_tax: totals?.totalExcludingTax,
                        tax: totals?.totalTax,
                        amount_including_tax: totals?.totalIncludingTax,
                        discount_amount: data.discount_amount,
                        discount_percentage: data.discount_percentage,
                        shipping_cost: data.shipping_cost,
                        status: data.status,
                        payment_method: data.payment_method,
                        currency: data.currency,
                        exchange_rate: data.exchange_rate,
                        conditions: data.conditions,
                        late_payment_penalty: data.late_payment_penalty,
                        notes: data.notes,
                        internal_notes: data.internal_notes,
                        language: data.language,
                        template_id: data.template_id,
                        meta_data: data.meta_data,
                    },
                });

                // Mettre à jour les lignes si fournies
                if (data.items && items) {
                    // Supprimer les anciennes lignes
                    await tx.invoiceItem.deleteMany({
                        where: { invoice_id: invoiceId },
                    });

                    // Créer les nouvelles lignes
                    await tx.invoiceItem.createMany({
                        data: items.map((item, index) => ({
                            invoice_id: invoiceId,
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

                return updatedInvoice;
            });

            // Invalider le cache
            await this.invalidateCache(invoiceId, existingInvoice.company_id!);

            logger.info({ invoiceId }, "Facture mise à jour avec succès");
            return await this.getInvoiceById(invoiceId);
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof InvoiceStatusError
            )
                throw error;
            logger.error(
                { error, invoiceId, data },
                "Erreur lors de la mise à jour de la facture"
            );
            throw new InvoiceError(
                "Erreur lors de la mise à jour de la facture"
            );
        }
    }

    // Supprimer une facture
    async deleteInvoice(invoiceId: string): Promise<void> {
        try {
            logger.info({ invoiceId }, "Suppression de la facture");

            // Vérifier que la facture existe
            const invoice = await this.getInvoiceById(invoiceId);

            // Vérifier le statut
            if (invoice.status === "paid") {
                throw new InvoiceStatusError(invoice.status, "supprimer");
            }

            // Soft delete si des paiements existent
            const paymentCount = await prisma.prisma.payment.count({
                where: { invoice_id: invoiceId },
            });

            if (paymentCount > 0) {
                await prisma.prisma.invoice.update({
                    where: { invoice_id: invoiceId },
                    data: {
                        status: "cancelled",
                        cancelled_at: new Date(),
                    },
                });
            } else {
                await prisma.prisma.invoice.delete({
                    where: { invoice_id: invoiceId },
                });
            }

            // Invalider le cache
            await this.invalidateCache(invoiceId, invoice.company_id!);

            logger.info({ invoiceId }, "Facture supprimée avec succès");
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof InvoiceStatusError
            )
                throw error;
            logger.error(
                { error, invoiceId },
                "Erreur lors de la suppression de la facture"
            );
            throw new InvoiceError(
                "Erreur lors de la suppression de la facture"
            );
        }
    }

    // Lister les factures avec pagination et filtres
    async listInvoices(
        companyId: string,
        params: IInvoiceQueryParams
    ): Promise<IPaginatedInvoices> {
        try {
            const {
                page = 1,
                limit = 10,
                search,
                customer_id,
                status,
                payment_status,
                payment_method,
                currency,
                date_from,
                date_to,
                due_date_from,
                due_date_to,
                amount_min,
                amount_max,
                overdue_only,
                paid_only,
                sortBy = "invoice_date",
                sortOrder = "desc",
            } = params;

            const skip = (page - 1) * limit;
            const cacheKey = `invoices:list:${companyId}:${JSON.stringify(
                params
            )}`;

            // Vérifier le cache
            const cached = await cacheService.getCachedList<IPaginatedInvoices>(
                "invoices",
                cacheKey
            );
            if (cached) {
                return cached;
            }

            // Construire les filtres
            const where: any = { company_id: companyId };

            if (search) {
                where.OR = [
                    {
                        invoice_number: {
                            contains: search,
                            mode: "insensitive",
                        },
                    },
                    { reference: { contains: search, mode: "insensitive" } },
                    { notes: { contains: search, mode: "insensitive" } },
                ];
            }

            if (customer_id) {
                where.customer_id = customer_id;
            }

            if (status && status.length > 0) {
                where.status = { in: status };
            }

            if (payment_status && payment_status.length > 0) {
                where.payment_status = { in: payment_status };
            }

            if (payment_method && payment_method.length > 0) {
                where.payment_method = { in: payment_method };
            }

            if (currency) {
                where.currency = currency;
            }

            if (date_from || date_to) {
                where.invoice_date = {};
                if (date_from) where.invoice_date.gte = date_from;
                if (date_to) where.invoice_date.lte = date_to;
            }

            if (due_date_from || due_date_to) {
                where.due_date = {};
                if (due_date_from) where.due_date.gte = due_date_from;
                if (due_date_to) where.due_date.lte = due_date_to;
            }

            if (amount_min || amount_max) {
                where.amount_including_tax = {};
                if (amount_min) where.amount_including_tax.gte = amount_min;
                if (amount_max) where.amount_including_tax.lte = amount_max;
            }

            if (overdue_only) {
                where.status = "overdue";
                where.due_date = { lt: new Date() };
            }

            if (paid_only) {
                where.payment_status = "paid";
            }

            // Exécuter les requêtes en parallèle
            const [invoices, total, summary] = await Promise.all([
                prisma.prisma.invoice.findMany({
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
                                payments: true,
                            },
                        },
                    },
                }),
                prisma.prisma.invoice.count({ where }),
                this.getInvoicesSummary(where),
            ]);

            const result: IPaginatedInvoices = {
                invoices: invoices as IInvoice[],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPreviousPage: page > 1,
                summary,
            };

            // Mettre en cache
            await cacheService.cacheList("invoices", cacheKey, result, 600); // 10 minutes

            return result;
        } catch (error) {
            logger.error(
                { error, companyId, params },
                "Erreur lors de la récupération des factures"
            );
            throw new InvoiceError(
                "Erreur lors de la récupération des factures"
            );
        }
    }

    // Marquer une facture comme envoyée
    async markAsSent(invoiceId: string): Promise<IInvoice> {
        try {
            const invoice = await this.getInvoiceById(invoiceId);

            if (invoice.status !== "draft" && invoice.status !== "pending") {
                throw new InvoiceStatusError(
                    invoice.status,
                    "marquer comme envoyée"
                );
            }

            const updatedInvoice = await prisma.prisma.invoice.update({
                where: { invoice_id: invoiceId },
                data: {
                    status: "sent",
                    sent_at: new Date(),
                },
            });

            await this.invalidateCache(invoiceId, invoice.company_id!);

            logger.info({ invoiceId }, "Facture marquée comme envoyée");
            return await this.getInvoiceById(invoiceId);
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof InvoiceStatusError
            )
                throw error;
            throw new InvoiceError("Erreur lors du marquage comme envoyée");
        }
    }

    // Marquer une facture comme payée
    async markAsPaid(
        invoiceId: string,
        paymentData?: {
            payment_date?: Date;
            payment_method?: string;
            payment_reference?: string;
            amount?: number;
        }
    ): Promise<IInvoice> {
        try {
            const invoice = await this.getInvoiceById(invoiceId);

            if (invoice.payment_status === "paid") {
                throw new InvoiceStatusError(
                    invoice.payment_status,
                    "marquer comme payée"
                );
            }

            await prisma.prisma.$transaction(async (tx) => {
                // Mettre à jour la facture
                await tx.invoice.update({
                    where: { invoice_id: invoiceId },
                    data: {
                        payment_status: "paid",
                        paid_at: paymentData?.payment_date || new Date(),
                        payment_method:
                            paymentData?.payment_method ||
                            invoice.payment_method,
                    },
                });

                // Créer un enregistrement de paiement si des données sont fournies
                if (paymentData) {
                    await tx.payment.create({
                        data: {
                            invoice_id: invoiceId,
                            payment_date:
                                paymentData.payment_date || new Date(),
                            amount:
                                paymentData.amount ||
                                invoice.amount_including_tax,
                            currency: invoice.currency,
                            payment_method:
                                paymentData.payment_method || "cash",
                            reference: paymentData.payment_reference,
                            status: "completed",
                        },
                    });
                }
            });

            await this.invalidateCache(invoiceId, invoice.company_id!);

            logger.info({ invoiceId }, "Facture marquée comme payée");
            return await this.getInvoiceById(invoiceId);
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof InvoiceStatusError
            )
                throw error;
            throw new InvoiceError("Erreur lors du marquage comme payée");
        }
    }

    // Obtenir les statistiques des factures
    async getInvoiceStats(companyId: string): Promise<IInvoiceStats> {
        try {
            const cacheKey = `${this.cachePrefix}:stats:${companyId}`;
            const cached = await cacheService.getCachedStats(
                "invoice",
                companyId
            );
            if (cached) {
                return cached;
            }

            const [
                totalInvoices,
                totalAmount,
                paidAmount,
                pendingAmount,
                overdueAmount,
                statusDistribution,
                paymentMethodDistribution,
                monthlyStats,
            ] = await Promise.all([
                prisma.prisma.invoice.count({
                    where: { company_id: companyId },
                }),
                this.getTotalAmount(companyId),
                this.getPaidAmount(companyId),
                this.getPendingAmount(companyId),
                this.getOverdueAmount(companyId),
                this.getStatusDistribution(companyId),
                this.getPaymentMethodDistribution(companyId),
                this.getMonthlyStats(companyId),
            ]);

            const stats: IInvoiceStats = {
                total_invoices: totalInvoices,
                total_amount: totalAmount,
                paid_amount: paidAmount,
                pending_amount: pendingAmount,
                overdue_amount: overdueAmount,
                average_amount:
                    totalInvoices > 0 ? totalAmount / totalInvoices : 0,
                average_payment_delay: await this.getAveragePaymentDelay(
                    companyId
                ),
                conversion_rate:
                    totalAmount > 0 ? (paidAmount / totalAmount) * 100 : 0,
                status_distribution: statusDistribution,
                payment_method_distribution: paymentMethodDistribution,
                monthly_stats: monthlyStats,
            };

            // Mettre en cache
            await cacheService.cacheStats("invoice", companyId, stats, 900); // 15 minutes

            return stats;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération des statistiques factures"
            );
            throw new InvoiceError(
                "Erreur lors de la récupération des statistiques factures"
            );
        }
    }

    // Actions en lot
    async bulkAction(
        action: IBulkInvoiceAction
    ): Promise<{ success: number; failed: number; errors: any[] }> {
        try {
            logger.info(
                { action: action.action, count: action.invoice_ids.length },
                "Action en lot sur les factures"
            );

            const results = { success: 0, failed: 0, errors: [] as any[] };

            for (const invoiceId of action.invoice_ids) {
                try {
                    switch (action.action) {
                        case "send":
                            await this.markAsSent(invoiceId);
                            break;
                        case "mark_paid":
                            await this.markAsPaid(invoiceId, action.options);
                            break;
                        case "mark_cancelled":
                            await this.updateInvoice(invoiceId, {
                                status: "cancelled",
                                cancelled_at: new Date(),
                            } as any);
                            break;
                        case "delete":
                            await this.deleteInvoice(invoiceId);
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
                    results.errors.push({ invoiceId, error: error.message });
                }
            }

            return results;
        } catch (error) {
            logger.error({ error, action }, "Erreur lors de l'action en lot");
            throw new InvoiceError("Erreur lors de l'action en lot");
        }
    }

    // Méthodes utilitaires privées

    private calculateInvoiceTotals(itemsData: any[]) {
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

    private async getInvoicesSummary(where: any) {
        const [amounts, statusCounts] = await Promise.all([
            prisma.prisma.invoice.aggregate({
                where,
                _sum: {
                    amount_including_tax: true,
                    amount_excluding_tax: true,
                    tax: true,
                },
            }),
            prisma.prisma.invoice.groupBy({
                by: ["status"],
                where,
                _count: { status: true },
            }),
        ]);

        return {
            total_amount: amounts._sum.amount_including_tax?.toNumber() || 0,
            paid_amount: 0, // À calculer séparément si nécessaire
            pending_amount: 0, // À calculer séparément si nécessaire
            overdue_amount: 0, // À calculer séparément si nécessaire
            count_by_status: statusCounts.reduce((acc, item) => {
                acc[item.status] = item._count.status;
                return acc;
            }, {} as Record<string, number>),
        };
    }

    // Méthodes utilitaires pour les statistiques
    private async getTotalAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.invoice.aggregate({
            where: { company_id: companyId },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getPaidAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.invoice.aggregate({
            where: { company_id: companyId, payment_status: "paid" },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getPendingAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.invoice.aggregate({
            where: {
                company_id: companyId,
                payment_status: { in: ["unpaid", "partially_paid"] },
            },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getOverdueAmount(companyId: string): Promise<number> {
        const result = await prisma.prisma.invoice.aggregate({
            where: {
                company_id: companyId,
                status: "overdue",
                due_date: { lt: new Date() },
            },
            _sum: { amount_including_tax: true },
        });
        return result._sum.amount_including_tax?.toNumber() || 0;
    }

    private async getStatusDistribution(
        companyId: string
    ): Promise<Record<string, number>> {
        const result = await prisma.prisma.invoice.groupBy({
            by: ["status"],
            where: { company_id: companyId },
            _count: { status: true },
        });

        return result.reduce((acc, item) => {
            acc[item.status] = item._count.status;
            return acc;
        }, {} as Record<string, number>);
    }

    private async getPaymentMethodDistribution(
        companyId: string
    ): Promise<Record<string, number>> {
        const result = await prisma.prisma.invoice.groupBy({
            by: ["payment_method"],
            where: { company_id: companyId, payment_method: { not: null } },
            _count: { payment_method: true },
        });

        return result.reduce((acc, item) => {
            if (item.payment_method) {
                acc[item.payment_method] = item._count.payment_method;
            }
            return acc;
        }, {} as Record<string, number>);
    }

    private async getMonthlyStats(companyId: string): Promise<any[]> {
        // Implémentation simplifiée - à améliorer selon les besoins
        return [];
    }

    private async getAveragePaymentDelay(companyId: string): Promise<number> {
        const invoices = await prisma.prisma.invoice.findMany({
            where: {
                company_id: companyId,
                payment_status: "paid",
                paid_at: { not: null },
            },
            select: { due_date: true, paid_at: true },
        });

        if (invoices.length === 0) return 0;

        const totalDelay = invoices.reduce((sum, invoice) => {
            const delay =
                (invoice.paid_at!.getTime() - invoice.due_date.getTime()) /
                (1000 * 60 * 60 * 24);
            return sum + delay;
        }, 0);

        return Math.round(totalDelay / invoices.length);
    }

    // Invalider le cache d'une facture
    private async invalidateCache(
        invoiceId: string,
        companyId: string
    ): Promise<void> {
        try {
            await Promise.all([
                cacheService.invalidateInvoice(invoiceId),
                cacheService.invalidateStats(companyId),
                cacheService.invalidateListCache("invoices"),
            ]);
        } catch (error) {
            logger.warn(
                { error, invoiceId },
                "Erreur lors de l'invalidation du cache"
            );
        }
    }
}

export default new InvoiceService();
