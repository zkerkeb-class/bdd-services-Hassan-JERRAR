export interface IQuote {
    quote_id: string;
    customer_id: string;
    user_id: string;
    company_id?: string;
    quote_number: string;
    reference?: string;
    title?: string;
    quote_date: Date;
    validity_date: Date;
    amount_excluding_tax: number;
    tax: number;
    amount_including_tax: number;
    discount_amount?: number;
    discount_percentage?: number;
    shipping_cost?: number;
    status:
        | "draft"
        | "pending"
        | "sent"
        | "viewed"
        | "accepted"
        | "rejected"
        | "expired"
        | "cancelled"
        | "converted";
    currency: string;
    exchange_rate?: number;
    conditions?: string;
    terms?: string;
    notes?: string;
    internal_notes?: string;
    pdf_url?: string;
    sent_at?: Date;
    viewed_at?: Date;
    accepted_at?: Date;
    rejected_at?: Date;
    expired_at?: Date;
    converted_to_invoice: boolean;
    invoice_id?: string;
    language: string;
    template_id?: string;
    meta_data?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;

    // Relations
    items?: IQuoteItem[];
    customer?: {
        customer_id: string;
        name: string;
        email?: string;
        type: "individual" | "company";
    };
}

export interface IQuoteItem {
    item_id: string;
    quote_id: string;
    product_id?: string;
    name?: string;
    description?: string;
    quantity: number;
    unit: string;
    unit_price_excluding_tax: number;
    discount_percentage?: number;
    discount_amount?: number;
    vat_rate: string;
    total_excluding_tax: number;
    total_including_tax: number;
    sort_order: number;
}

export interface ICreateQuoteRequest {
    customer_id: string;
    reference?: string;
    title?: string;
    quote_date: Date;
    validity_date: Date;
    discount_amount?: number;
    discount_percentage?: number;
    shipping_cost?: number;
    currency?: string;
    exchange_rate?: number;
    conditions?: string;
    terms?: string;
    notes?: string;
    internal_notes?: string;
    language?: string;
    template_id?: string;
    meta_data?: Record<string, any>;

    items: {
        product_id?: string;
        name: string;
        description?: string;
        quantity: number;
        unit: string;
        unit_price_excluding_tax: number;
        discount_percentage?: number;
        discount_amount?: number;
        vat_rate: string;
        sort_order?: number;
    }[];
}

export interface IUpdateQuoteRequest {
    customer_id?: string;
    reference?: string;
    title?: string;
    quote_date?: Date;
    validity_date?: Date;
    discount_amount?: number;
    discount_percentage?: number;
    shipping_cost?: number;
    status?: string;
    currency?: string;
    exchange_rate?: number;
    conditions?: string;
    terms?: string;
    notes?: string;
    internal_notes?: string;
    language?: string;
    template_id?: string;
    meta_data?: Record<string, any>;

    items?: {
        item_id?: string;
        product_id?: string;
        name?: string;
        description?: string;
        quantity?: number;
        unit?: string;
        unit_price_excluding_tax?: number;
        discount_percentage?: number;
        discount_amount?: number;
        vat_rate?: string;
        sort_order?: number;
    }[];
}

export interface IQuoteQueryParams {
    page?: number;
    limit?: number;
    search?: string;
    customer_id?: string;
    status?: string[];
    currency?: string;
    date_from?: Date;
    date_to?: Date;
    validity_from?: Date;
    validity_to?: Date;
    amount_min?: number;
    amount_max?: number;
    expired_only?: boolean;
    convertible_only?: boolean;
    template_id?: string;
    sortBy?:
        | "quote_number"
        | "quote_date"
        | "validity_date"
        | "amount_including_tax"
        | "status"
        | "customer_name";
    sortOrder?: "asc" | "desc";
}

export interface IPaginatedQuotes {
    quotes: IQuote[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    summary: {
        total_amount: number;
        accepted_amount: number;
        pending_amount: number;
        expired_amount: number;
        count_by_status: Record<string, number>;
    };
}

export interface IQuoteStats {
    total_quotes: number;
    total_amount: number;
    accepted_amount: number;
    pending_amount: number;
    expired_amount: number;
    average_amount: number;
    acceptance_rate: number;
    conversion_rate: number;
    average_response_time: number; // en jours
    status_distribution: Record<string, number>;
    monthly_stats: {
        month: string;
        count: number;
        amount: number;
        accepted_count: number;
        accepted_amount: number;
    }[];
}

export interface IQuoteConversion {
    quote_id: string;
    customer_id: string;
    invoice_date?: Date;
    due_date?: Date;
    payment_terms?: number;
    notes?: string;
    keep_original_items: boolean;
    apply_current_prices: boolean;
}

export interface IQuoteExportOptions {
    format: "PDF" | "CSV" | "XLSX" | "JSON";
    include_items: boolean;
    include_customer_details: boolean;
    template_id?: string;
    language?: string;
    filters?: IQuoteQueryParams;
}

export interface IBulkQuoteAction {
    action:
        | "send"
        | "mark_accepted"
        | "mark_rejected"
        | "mark_expired"
        | "convert_to_invoice"
        | "export"
        | "delete";
    quote_ids: string[];
    options?: {
        email_template?: string;
        acceptance_date?: Date;
        rejection_reason?: string;
        conversion_settings?: IQuoteConversion;
        export_format?: string;
    };
}

export interface IQuoteTemplate {
    template_id: string;
    name: string;
    description?: string;
    html_content: string;
    css_styles?: string;
    variables: string[];
    is_default: boolean;
    is_active: boolean;
    created_by: string;
    createdAt: Date;
    updatedAt: Date;
}
