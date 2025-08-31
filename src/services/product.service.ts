import prisma from "../lib/prisma";
import cacheService from "../lib/redis";
import logger from "../utils/logger";
import {
    IProduct,
    ICreateProductRequest,
    IUpdateProductRequest,
    IProductQueryParams,
    IPaginatedProducts,
    IProductStats,
    IStockAdjustment,
    IBulkProductAction,
} from "../interfaces/product.interface";
import {
    ProductError,
    NotFoundError,
    DuplicateError,
    StockError,
    ValidationError,
} from "../utils/customError";

class ProductService {
    private cachePrefix = "product";
    private cacheTTL = 7200; // 2 heures

    // Créer un nouveau produit
    async createProduct(
        data: ICreateProductRequest,
        companyId: string
    ): Promise<IProduct> {
        try {
            logger.info({ companyId }, "Création d'un nouveau produit");

            // Vérifier l'unicité du SKU s'il est fourni
            if (data.sku) {
                const existingProduct = await prisma.prisma.product.findFirst({
                    where: {
                        company_id: companyId,
                        sku: data.sku,
                        is_active: true,
                    },
                });

                if (existingProduct) {
                    throw new DuplicateError("sku", data.sku);
                }
            }

            // Calculer la marge si prix de revient fourni
            let marginPercentage = data.margin_percentage;
            if (data.cost_price && !marginPercentage) {
                marginPercentage =
                    ((data.price_excluding_tax - data.cost_price) /
                        data.cost_price) *
                    100;
            }

            const product = await prisma.prisma.product.create({
                data: {
                    company_id: companyId,
                    name: data.name,
                    description: data.description,
                    sku: data.sku,
                    barcode: data.barcode,
                    category: data.category,
                    brand: data.brand,
                    price_excluding_tax: data.price_excluding_tax,
                    cost_price: data.cost_price,
                    margin_percentage: marginPercentage,
                    vat_rate: data.vat_rate,
                    unit: data.unit || "unite",
                    weight: data.weight,
                    dimensions: data.dimensions,
                    stock_quantity: data.stock_quantity || 0,
                    min_stock_level: data.min_stock_level || 0,
                    max_stock_level: data.max_stock_level,
                    track_inventory: data.track_inventory || false,
                    is_digital: data.is_digital || false,
                    image_urls: data.image_urls || [],
                    tags: data.tags || [],
                    meta_data: data.meta_data,
                },
            });

            // Invalider le cache
            await this.invalidateCache(product.product_id, companyId);

            logger.info(
                { productId: product.product_id },
                "Produit créé avec succès"
            );
            return product as IProduct;
        } catch (error) {
            logger.error(
                { error, data },
                "Erreur lors de la création du produit"
            );
            if (error instanceof DuplicateError) throw error;
            throw new ProductError("Erreur lors de la création du produit");
        }
    }

    // Récupérer un produit par ID
    async getProductById(productId: string): Promise<IProduct> {
        try {
            // Vérifier le cache
            const cacheKey = `${this.cachePrefix}:${productId}`;
            const cached = await cacheService.get<IProduct>(cacheKey);
            if (cached) {
                return cached;
            }

            const product = await prisma.prisma.product.findUnique({
                where: { product_id: productId },
                include: {
                    _count: {
                        select: {
                            invoice_items: true,
                            quote_items: true,
                        },
                    },
                },
            });

            if (!product) {
                throw new NotFoundError("Produit", productId);
            }

            // Mettre en cache
            await cacheService.set(cacheKey, product, this.cacheTTL);

            return product as IProduct;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, productId },
                "Erreur lors de la récupération du produit"
            );
            throw new ProductError("Erreur lors de la récupération du produit");
        }
    }

    // Récupérer un produit par SKU
    async getProductBySku(sku: string, companyId: string): Promise<IProduct> {
        try {
            const product = await prisma.prisma.product.findFirst({
                where: {
                    sku,
                    company_id: companyId,
                    is_active: true,
                },
                include: {
                    _count: {
                        select: {
                            invoice_items: true,
                            quote_items: true,
                        },
                    },
                },
            });

            if (!product) {
                throw new NotFoundError("Produit", `SKU: ${sku}`);
            }

            return product as IProduct;
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, sku, companyId },
                "Erreur lors de la récupération du produit par SKU"
            );
            throw new ProductError("Erreur lors de la récupération du produit");
        }
    }

    // Mettre à jour un produit
    async updateProduct(
        productId: string,
        data: IUpdateProductRequest
    ): Promise<IProduct> {
        try {
            logger.info({ productId, data }, "Mise à jour du produit");

            // Vérifier que le produit existe
            const existingProduct = await this.getProductById(productId);

            // Vérifier l'unicité du SKU s'il est modifié
            if (data.sku && data.sku !== existingProduct.sku) {
                const duplicateProduct = await prisma.prisma.product.findFirst({
                    where: {
                        company_id: existingProduct.company_id,
                        sku: data.sku,
                        product_id: { not: productId },
                        is_active: true,
                    },
                });

                if (duplicateProduct) {
                    throw new DuplicateError("sku", data.sku);
                }
            }

            // Calculer la marge si nécessaire
            let marginPercentage = data.margin_percentage;
            if (
                data.cost_price &&
                data.price_excluding_tax &&
                !marginPercentage
            ) {
                marginPercentage =
                    ((data.price_excluding_tax - data.cost_price) /
                        data.cost_price) *
                    100;
            }

            const product = await prisma.prisma.product.update({
                where: { product_id: productId },
                data: {
                    ...data,
                    margin_percentage:
                        marginPercentage || data.margin_percentage,
                },
            });

            // Invalider le cache
            await this.invalidateCache(productId, existingProduct.company_id);

            logger.info({ productId }, "Produit mis à jour avec succès");
            return product as IProduct;
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof DuplicateError
            )
                throw error;
            logger.error(
                { error, productId, data },
                "Erreur lors de la mise à jour du produit"
            );
            throw new ProductError("Erreur lors de la mise à jour du produit");
        }
    }

    // Supprimer un produit (soft delete)
    async deleteProduct(productId: string): Promise<void> {
        try {
            logger.info({ productId }, "Suppression du produit");

            // Vérifier que le produit existe
            const product = await this.getProductById(productId);

            // Vérifier qu'il n'y a pas de factures ou devis associés
            const [invoiceItemCount, quoteItemCount] = await Promise.all([
                prisma.prisma.invoiceItem.count({
                    where: { product_id: productId },
                }),
                prisma.prisma.quoteItem.count({
                    where: { product_id: productId },
                }),
            ]);

            if (invoiceItemCount > 0 || quoteItemCount > 0) {
                // Soft delete si des documents existent
                await prisma.prisma.product.update({
                    where: { product_id: productId },
                    data: { is_active: false },
                });
            } else {
                // Hard delete si aucun document
                await prisma.prisma.product.delete({
                    where: { product_id: productId },
                });
            }

            // Invalider le cache
            await this.invalidateCache(productId, product.company_id);

            logger.info({ productId }, "Produit supprimé avec succès");
        } catch (error) {
            if (error instanceof NotFoundError) throw error;
            logger.error(
                { error, productId },
                "Erreur lors de la suppression du produit"
            );
            throw new ProductError("Erreur lors de la suppression du produit");
        }
    }

    // Lister les produits avec pagination et filtres
    async listProducts(
        companyId: string,
        params: IProductQueryParams
    ): Promise<IPaginatedProducts> {
        try {
            const {
                page = 1,
                limit = 10,
                search,
                category,
                brand,
                tags,
                is_active,
                is_digital,
                track_inventory,
                in_stock_only,
                low_stock_only,
                price_min,
                price_max,
                vat_rate,
                sortBy = "name",
                sortOrder = "asc",
            } = params;

            const skip = (page - 1) * limit;
            const cacheKey = `products:list:${companyId}:${JSON.stringify(
                params
            )}`;

            // Vérifier le cache
            const cached = await cacheService.getCachedList<IPaginatedProducts>(
                "products",
                cacheKey
            );
            if (cached) {
                return cached;
            }

            // Construire les filtres
            const where: any = { company_id: companyId };

            if (search) {
                where.OR = [
                    { name: { contains: search, mode: "insensitive" } },
                    { description: { contains: search, mode: "insensitive" } },
                    { sku: { contains: search, mode: "insensitive" } },
                    { barcode: { contains: search } },
                    { brand: { contains: search, mode: "insensitive" } },
                ];
            }

            if (category) {
                where.category = { contains: category, mode: "insensitive" };
            }

            if (brand) {
                where.brand = { contains: brand, mode: "insensitive" };
            }

            if (tags && tags.length > 0) {
                where.tags = { hasSome: tags };
            }

            if (typeof is_active === "boolean") {
                where.is_active = is_active;
            }

            if (typeof is_digital === "boolean") {
                where.is_digital = is_digital;
            }

            if (typeof track_inventory === "boolean") {
                where.track_inventory = track_inventory;
            }

            if (in_stock_only) {
                where.stock_quantity = { gt: 0 };
            }

            if (low_stock_only) {
                where.AND = [
                    { track_inventory: true },
                    {
                        OR: [
                            {
                                stock_quantity: {
                                    lte: prisma.prisma.product.fields
                                        .min_stock_level,
                                },
                            },
                            { stock_quantity: 0 },
                        ],
                    },
                ];
            }

            if (price_min || price_max) {
                where.price_excluding_tax = {};
                if (price_min) where.price_excluding_tax.gte = price_min;
                if (price_max) where.price_excluding_tax.lte = price_max;
            }

            if (vat_rate) {
                where.vat_rate = vat_rate;
            }

            // Exécuter les requêtes en parallèle
            const [products, total, summary] = await Promise.all([
                prisma.prisma.product.findMany({
                    where,
                    skip,
                    take: limit,
                    orderBy: { [sortBy]: sortOrder },
                    include: {
                        _count: {
                            select: {
                                invoice_items: true,
                                quote_items: true,
                            },
                        },
                    },
                }),
                prisma.prisma.product.count({ where }),
                this.getProductsSummary(where),
            ]);

            const result: IPaginatedProducts = {
                products: products as IProduct[],
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page < Math.ceil(total / limit),
                hasPreviousPage: page > 1,
                summary,
            };

            // Mettre en cache
            await cacheService.cacheList("products", cacheKey, result, 600); // 10 minutes

            return result;
        } catch (error) {
            logger.error(
                { error, companyId, params },
                "Erreur lors de la récupération des produits"
            );
            throw new ProductError(
                "Erreur lors de la récupération des produits"
            );
        }
    }

    // Ajuster le stock d'un produit
    async adjustStock(
        productId: string,
        adjustment: IStockAdjustment,
        userId: string
    ): Promise<IProduct> {
        try {
            logger.info({ productId, adjustment }, "Ajustement du stock");

            const product = await this.getProductById(productId);

            if (!product.track_inventory) {
                throw new ValidationError("Ce produit ne suit pas les stocks", {
                    productId,
                });
            }

            let newQuantity: number;

            switch (adjustment.adjustment_type) {
                case "add":
                    newQuantity =
                        (product.stock_quantity || 0) + adjustment.quantity;
                    break;
                case "remove":
                    newQuantity =
                        (product.stock_quantity || 0) - adjustment.quantity;
                    if (newQuantity < 0) {
                        throw new StockError(
                            "Stock insuffisant",
                            productId,
                            adjustment.quantity,
                            product.stock_quantity || 0
                        );
                    }
                    break;
                case "set":
                    newQuantity = adjustment.quantity;
                    break;
                default:
                    throw new ValidationError("Type d'ajustement invalide", {
                        adjustment_type: adjustment.adjustment_type,
                    });
            }

            const updatedProduct = await prisma.prisma.product.update({
                where: { product_id: productId },
                data: { stock_quantity: newQuantity },
            });

            // Enregistrer le mouvement de stock (si table implémentée)
            // await this.recordStockMovement(productId, adjustment, userId);

            // Invalider le cache
            await this.invalidateCache(productId, product.company_id);

            logger.info(
                {
                    productId,
                    oldQuantity: product.stock_quantity,
                    newQuantity,
                },
                "Stock ajusté avec succès"
            );

            return updatedProduct as IProduct;
        } catch (error) {
            if (
                error instanceof NotFoundError ||
                error instanceof StockError ||
                error instanceof ValidationError
            ) {
                throw error;
            }
            logger.error(
                { error, productId, adjustment },
                "Erreur lors de l'ajustement du stock"
            );
            throw new ProductError("Erreur lors de l'ajustement du stock");
        }
    }

    // Vérifier la disponibilité du stock
    async checkStockAvailability(
        productId: string,
        requestedQuantity: number
    ): Promise<boolean> {
        try {
            const product = await this.getProductById(productId);

            if (!product.track_inventory) {
                return true; // Stock illimité pour les produits non suivis
            }

            return (product.stock_quantity || 0) >= requestedQuantity;
        } catch (error) {
            logger.error(
                { error, productId, requestedQuantity },
                "Erreur lors de la vérification du stock"
            );
            return false;
        }
    }

    // Réserver du stock
    async reserveStock(productId: string, quantity: number): Promise<void> {
        try {
            const product = await this.getProductById(productId);

            if (!product.track_inventory) {
                return; // Pas de réservation pour les produits non suivis
            }

            if ((product.stock_quantity || 0) < quantity) {
                throw new StockError(
                    "Stock insuffisant pour la réservation",
                    productId,
                    quantity,
                    product.stock_quantity || 0
                );
            }

            await prisma.prisma.product.update({
                where: { product_id: productId },
                data: {
                    stock_quantity: (product.stock_quantity || 0) - quantity,
                },
            });

            await this.invalidateCache(productId, product.company_id);

            logger.info({ productId, quantity }, "Stock réservé avec succès");
        } catch (error) {
            if (error instanceof StockError) throw error;
            logger.error(
                { error, productId, quantity },
                "Erreur lors de la réservation du stock"
            );
            throw new ProductError("Erreur lors de la réservation du stock");
        }
    }

    // Obtenir les statistiques des produits
    async getProductStats(companyId: string): Promise<IProductStats> {
        try {
            const cacheKey = `${this.cachePrefix}:stats:${companyId}`;
            const cached = await cacheService.getCachedStats(
                "product",
                companyId
            );
            if (cached) {
                return cached;
            }

            const [
                totalProducts,
                activeProducts,
                digitalProducts,
                trackedProducts,
                inventoryValue,
                lowStockCount,
                outOfStockCount,
                topCategories,
                recentSales,
            ] = await Promise.all([
                prisma.prisma.product.count({
                    where: { company_id: companyId },
                }),
                prisma.prisma.product.count({
                    where: { company_id: companyId, is_active: true },
                }),
                prisma.prisma.product.count({
                    where: { company_id: companyId, is_digital: true },
                }),
                prisma.prisma.product.count({
                    where: { company_id: companyId, track_inventory: true },
                }),
                this.calculateInventoryValue(companyId),
                this.getLowStockCount(companyId),
                prisma.prisma.product.count({
                    where: {
                        company_id: companyId,
                        track_inventory: true,
                        stock_quantity: 0,
                    },
                }),
                this.getTopCategories(companyId),
                this.getRecentSales(companyId),
            ]);

            const avgPrice = await this.getAveragePrice(companyId);
            const avgMargin = await this.getAverageMargin(companyId);

            const stats: IProductStats = {
                total_products: totalProducts,
                active_products: activeProducts,
                digital_products: digitalProducts,
                tracked_products: trackedProducts,
                total_inventory_value: inventoryValue,
                average_price: avgPrice,
                average_margin: avgMargin,
                low_stock_alerts: lowStockCount,
                out_of_stock_count: outOfStockCount,
                top_categories: topCategories,
                recent_sales: recentSales,
            };

            // Mettre en cache
            await cacheService.cacheStats("product", companyId, stats, 900); // 15 minutes

            return stats;
        } catch (error) {
            logger.error(
                { error, companyId },
                "Erreur lors de la récupération des statistiques produits"
            );
            throw new ProductError(
                "Erreur lors de la récupération des statistiques produits"
            );
        }
    }

    // Actions en lot
    async bulkAction(
        action: IBulkProductAction
    ): Promise<{ success: number; failed: number; errors: any[] }> {
        try {
            logger.info(
                { action: action.action, count: action.product_ids.length },
                "Action en lot sur les produits"
            );

            const results = { success: 0, failed: 0, errors: [] as any[] };

            for (const productId of action.product_ids) {
                try {
                    switch (action.action) {
                        case "update_prices":
                            if (action.options?.price_change) {
                                await this.updatePrice(
                                    productId,
                                    action.options.price_change
                                );
                            }
                            break;
                        case "update_stock":
                            if (action.options?.stock_change) {
                                await this.adjustStock(
                                    productId,
                                    {
                                        adjustment_type:
                                            action.options.stock_change.type,
                                        quantity:
                                            action.options.stock_change
                                                .quantity,
                                        reason: action.options.stock_change
                                            .reason,
                                    },
                                    "system"
                                );
                            }
                            break;
                        case "update_category":
                            if (action.options?.category) {
                                await this.updateProduct(productId, {
                                    category: action.options.category,
                                });
                            }
                            break;
                        case "activate":
                            await this.updateProduct(productId, {
                                is_active: true,
                            });
                            break;
                        case "deactivate":
                            await this.updateProduct(productId, {
                                is_active: false,
                            });
                            break;
                        case "delete":
                            await this.deleteProduct(productId);
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
                    results.errors.push({ productId, error: error.message });
                }
            }

            return results;
        } catch (error) {
            logger.error({ error, action }, "Erreur lors de l'action en lot");
            throw new ProductError("Erreur lors de l'action en lot");
        }
    }

    // Méthodes utilitaires privées

    private async updatePrice(
        productId: string,
        priceChange: any
    ): Promise<void> {
        const product = await this.getProductById(productId);
        let newPrice: number;

        if (priceChange.apply_to === "base_price") {
            if (priceChange.type === "percentage") {
                newPrice =
                    product.price_excluding_tax * (1 + priceChange.value / 100);
            } else {
                newPrice = product.price_excluding_tax + priceChange.value;
            }
            await this.updateProduct(productId, {
                price_excluding_tax: newPrice,
            });
        } else if (
            priceChange.apply_to === "cost_price" &&
            product.cost_price
        ) {
            if (priceChange.type === "percentage") {
                newPrice = product.cost_price * (1 + priceChange.value / 100);
            } else {
                newPrice = product.cost_price + priceChange.value;
            }
            await this.updateProduct(productId, { cost_price: newPrice });
        }
    }

    private async getProductsSummary(where: any) {
        const [totalValue, avgPrice, totalStock, categories] =
            await Promise.all([
                this.calculateTotalValue(where),
                this.calculateAveragePrice(where),
                this.calculateTotalStock(where),
                this.getCategoriesDistribution(where),
            ]);

        return {
            total_value: totalValue,
            avg_price: avgPrice,
            total_stock: totalStock,
            low_stock_count: 0, // À calculer si nécessaire
            out_of_stock_count: 0, // À calculer si nécessaire
            categories,
        };
    }

    private async calculateInventoryValue(companyId: string): Promise<number> {
        const products = await prisma.prisma.product.findMany({
            where: {
                company_id: companyId,
                track_inventory: true,
                is_active: true,
            },
            select: {
                stock_quantity: true,
                cost_price: true,
                price_excluding_tax: true,
            },
        });

        return products.reduce((total, product) => {
            const price = product.cost_price || product.price_excluding_tax;
            return total + (product.stock_quantity || 0) * price.toNumber();
        }, 0);
    }

    private async getLowStockCount(companyId: string): Promise<number> {
        return await prisma.prisma.product.count({
            where: {
                company_id: companyId,
                track_inventory: true,
                is_active: true,
                stock_quantity: {
                    lte: prisma.prisma.product.fields.min_stock_level,
                },
            },
        });
    }

    private async getAveragePrice(companyId: string): Promise<number> {
        const result = await prisma.prisma.product.aggregate({
            where: { company_id: companyId, is_active: true },
            _avg: { price_excluding_tax: true },
        });
        return result._avg.price_excluding_tax?.toNumber() || 0;
    }

    private async getAverageMargin(companyId: string): Promise<number> {
        const result = await prisma.prisma.product.aggregate({
            where: {
                company_id: companyId,
                is_active: true,
                margin_percentage: { not: null },
            },
            _avg: { margin_percentage: true },
        });
        return result._avg.margin_percentage?.toNumber() || 0;
    }

    private async getTopCategories(companyId: string): Promise<any[]> {
        const result = await prisma.prisma.product.groupBy({
            by: ["category"],
            where: {
                company_id: companyId,
                is_active: true,
                category: { not: null },
            },
            _count: { category: true },
            _sum: { price_excluding_tax: true },
            orderBy: { _count: { category: "desc" } },
            take: 5,
        });

        return result.map((item) => ({
            category: item.category,
            count: item._count.category,
            total_value: item._sum.price_excluding_tax?.toNumber() || 0,
        }));
    }

    private async getRecentSales(companyId: string): Promise<any[]> {
        // Implémentation simplifiée - nécessiterait une table de ventes ou analyse des factures
        return [];
    }

    private async calculateTotalValue(where: any): Promise<number> {
        const result = await prisma.prisma.product.aggregate({
            where,
            _sum: { price_excluding_tax: true },
        });
        return result._sum.price_excluding_tax?.toNumber() || 0;
    }

    private async calculateAveragePrice(where: any): Promise<number> {
        const result = await prisma.prisma.product.aggregate({
            where,
            _avg: { price_excluding_tax: true },
        });
        return result._avg.price_excluding_tax?.toNumber() || 0;
    }

    private async calculateTotalStock(where: any): Promise<number> {
        const result = await prisma.prisma.product.aggregate({
            where: { ...where, track_inventory: true },
            _sum: { stock_quantity: true },
        });
        return result._sum.stock_quantity || 0;
    }

    private async getCategoriesDistribution(
        where: any
    ): Promise<Record<string, number>> {
        const result = await prisma.prisma.product.groupBy({
            by: ["category"],
            where: { ...where, category: { not: null } },
            _count: { category: true },
        });

        return result.reduce((acc, item) => {
            if (item.category) {
                acc[item.category] = item._count.category;
            }
            return acc;
        }, {} as Record<string, number>);
    }

    // Invalider le cache d'un produit
    private async invalidateCache(
        productId: string,
        companyId: string
    ): Promise<void> {
        try {
            await Promise.all([
                cacheService.invalidateProduct(productId),
                cacheService.invalidateStats(companyId),
                cacheService.invalidateListCache("products"),
            ]);
        } catch (error) {
            logger.warn(
                { error, productId },
                "Erreur lors de l'invalidation du cache"
            );
        }
    }
}

export default new ProductService();
