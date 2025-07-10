export interface IProduct {
    product_id: string;
    company_id: string;
    name: string;
    description?: string;
    sku?: string;
    barcode?: string;
    category?: string;
    brand?: string;
    price_excluding_tax: number;
    cost_price?: number;
    margin_percentage?: number;
    vat_rate: string;
    unit: string;
    weight?: number;
    dimensions?: {
        length?: number;
        width?: number;
        height?: number;
    };
    stock_quantity?: number;
    min_stock_level?: number;
    max_stock_level?: number;
    track_inventory: boolean;
    is_active: boolean;
    is_digital: boolean;
    image_urls: string[];
    tags: string[];
    meta_data?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICreateProductRequest {
    name: string;
    description?: string;
    sku?: string;
    barcode?: string;
    category?: string;
    brand?: string;
    price_excluding_tax: number;
    cost_price?: number;
    margin_percentage?: number;
    vat_rate: string;
    unit?: string;
    weight?: number;
    dimensions?: {
        length?: number;
        width?: number;
        height?: number;
    };
    stock_quantity?: number;
    min_stock_level?: number;
    max_stock_level?: number;
    track_inventory?: boolean;
    is_digital?: boolean;
    image_urls?: string[];
    tags?: string[];
    meta_data?: Record<string, any>;
}

export interface IUpdateProductRequest {
    name?: string;
    description?: string;
    sku?: string;
    barcode?: string;
    category?: string;
    brand?: string;
    price_excluding_tax?: number;
    cost_price?: number;
    margin_percentage?: number;
    vat_rate?: string;
    unit?: string;
    weight?: number;
    dimensions?: {
        length?: number;
        width?: number;
        height?: number;
    };
    stock_quantity?: number;
    min_stock_level?: number;
    max_stock_level?: number;
    track_inventory?: boolean;
    is_active?: boolean;
    is_digital?: boolean;
    image_urls?: string[];
    tags?: string[];
    meta_data?: Record<string, any>;
}

export interface IProductQueryParams {
    page?: number;
    limit?: number;
    search?: string;
    category?: string;
    brand?: string;
    tags?: string[];
    is_active?: boolean;
    is_digital?: boolean;
    track_inventory?: boolean;
    in_stock_only?: boolean;
    low_stock_only?: boolean;
    price_min?: number;
    price_max?: number;
    vat_rate?: string;
    sortBy?:
        | "name"
        | "price_excluding_tax"
        | "stock_quantity"
        | "createdAt"
        | "category"
        | "margin_percentage";
    sortOrder?: "asc" | "desc";
}

export interface IPaginatedProducts {
    products: IProduct[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    summary: {
        total_value: number;
        avg_price: number;
        total_stock: number;
        low_stock_count: number;
        out_of_stock_count: number;
        categories: Record<string, number>;
    };
}

export interface IProductStats {
    total_products: number;
    active_products: number;
    digital_products: number;
    tracked_products: number;
    total_inventory_value: number;
    average_price: number;
    average_margin: number;
    low_stock_alerts: number;
    out_of_stock_count: number;
    top_categories: {
        category: string;
        count: number;
        total_value: number;
    }[];
    recent_sales: {
        product_id: string;
        name: string;
        quantity_sold: number;
        revenue: number;
        last_sale_date: Date;
    }[];
}

export interface IProductInventory {
    product_id: string;
    current_stock: number;
    min_level: number;
    max_level: number;
    reserved_quantity: number;
    available_quantity: number;
    incoming_quantity: number;
    last_updated: Date;
    stock_movements: IStockMovement[];
}

export interface IStockMovement {
    movement_id: string;
    product_id: string;
    type: "in" | "out" | "adjustment" | "transfer" | "return";
    quantity: number;
    reason: string;
    reference?: string;
    cost_per_unit?: number;
    total_cost?: number;
    notes?: string;
    created_by: string;
    createdAt: Date;
}

export interface IStockAdjustment {
    product_id: string;
    adjustment_type: "add" | "remove" | "set";
    quantity: number;
    reason: string;
    reference?: string;
    cost_per_unit?: number;
    notes?: string;
}

export interface IProductPricing {
    product_id: string;
    base_price: number;
    cost_price?: number;
    margin_percentage?: number;
    margin_amount?: number;
    price_rules?: {
        rule_id: string;
        name: string;
        condition: string;
        discount_type: "percentage" | "fixed";
        discount_value: number;
        min_quantity?: number;
        customer_groups?: string[];
        valid_from?: Date;
        valid_to?: Date;
    }[];
}

export interface IBulkProductAction {
    action:
        | "update_prices"
        | "update_stock"
        | "update_category"
        | "activate"
        | "deactivate"
        | "export"
        | "delete";
    product_ids: string[];
    options?: {
        price_change?: {
            type: "percentage" | "fixed";
            value: number;
            apply_to: "base_price" | "cost_price";
        };
        stock_change?: {
            type: "add" | "remove" | "set";
            quantity: number;
            reason: string;
        };
        category?: string;
        export_format?: "CSV" | "XLSX" | "JSON";
    };
}

export interface IProductExportOptions {
    format: "CSV" | "XLSX" | "JSON";
    include_inventory: boolean;
    include_pricing: boolean;
    include_images: boolean;
    include_sales_data: boolean;
    filters?: IProductQueryParams;
}

export interface IProductImportOptions {
    file_format: "CSV" | "XLSX";
    mapping: Record<string, string>; // Mapping des colonnes
    options: {
        skip_header: boolean;
        update_existing: boolean;
        create_categories: boolean;
        validate_only: boolean;
    };
}

export interface IProductCategory {
    category_id: string;
    name: string;
    description?: string;
    parent_id?: string;
    image_url?: string;
    sort_order: number;
    is_active: boolean;
    products_count: number;
    children?: IProductCategory[];
}
