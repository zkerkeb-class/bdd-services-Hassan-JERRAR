export interface IInvoice {
    invoice_id: string;
    customer_id: string;
    user_id: string;
    company_id?: string;
    invoice_number: string;
    reference?: string;
    invoice_date: Date;
    due_date: Date;
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
        | "paid"
        | "partially_paid"
        | "overdue"
        | "cancelled"
        | "refunded";
    payment_status:
        | "unpaid"
        | "partially_paid"
        | "paid"
        | "overpaid"
        | "refunded"
        | "failed"
        | "pending"
        | "cancelled";
    payment_method?:
        | "cash"
        | "check"
        | "credit_card"
        | "debit_card"
        | "bank_transfer"
        | "stripe"
        | "paypal"
        | "other";
    currency: string;
    exchange_rate?: number;
    conditions?: string;
    late_payment_penalty?: string;
    notes?: string;
    internal_notes?: string;
    pdf_url?: string;
    sent_at?: Date;
    paid_at?: Date;
    cancelled_at?: Date;
    reminder_count: number;
    last_reminder_at?: Date;
    language: string;
    template_id?: string;
    meta_data?: Record<string, any>;
    createdAt: Date;
    updatedAt: Date;

    // Relations
    items?: IInvoiceItem[];
    payments?: IPayment[];
    customer?: {
        customer_id: string;
        name: string;
        email?: string;
        type: "individual" | "company";
    };
}

export interface IInvoiceItem {
    item_id: string;
    invoice_id: string;
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

export interface IPayment {
    payment_id: string;
    invoice_id: string;
    payment_date: Date;
    amount: number;
    currency: string;
    exchange_rate?: number;
    payment_method:
        | "cash"
        | "check"
        | "credit_card"
        | "debit_card"
        | "bank_transfer"
        | "stripe"
        | "paypal"
        | "other";
    transaction_id?: string;
    description?: string;
    reference?: string;
    status:
        | "unpaid"
        | "partially_paid"
        | "paid"
        | "overpaid"
        | "refunded"
        | "failed"
        | "pending"
        | "cancelled";
    fees?: number;
    net_amount?: number;
    gateway?: string;
    gateway_response?: Record<string, any>;
    reconciled: boolean;
    reconciled_at?: Date;
    notes?: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICreateInvoiceRequest {
    customer_id: string;
    reference?: string;
    invoice_date: Date;
    due_date: Date;
    discount_amount?: number;
    discount_percentage?: number;
    shipping_cost?: number;
    currency?: string;
    exchange_rate?: number;
    conditions?: string;
    late_payment_penalty?: string;
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

export interface IUpdateInvoiceRequest {
    customer_id?: string;
    reference?: string;
    invoice_date?: Date;
    due_date?: Date;
    discount_amount?: number;
    discount_percentage?: number;
    shipping_cost?: number;
    status?: string;
    payment_method?: string;
    currency?: string;
    exchange_rate?: number;
    conditions?: string;
    late_payment_penalty?: string;
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

export interface IInvoiceQueryParams {
    page?: number;
    limit?: number;
    search?: string;
    customer_id?: string;
    status?: string[];
    payment_status?: string[];
    payment_method?: string[];
    currency?: string;
    date_from?: Date;
    date_to?: Date;
    due_date_from?: Date;
    due_date_to?: Date;
    amount_min?: number;
    amount_max?: number;
    overdue_only?: boolean;
    paid_only?: boolean;
    template_id?: string;
    sortBy?:
        | "invoice_number"
        | "invoice_date"
        | "due_date"
        | "amount_including_tax"
        | "status"
        | "customer_name";
    sortOrder?: "asc" | "desc";
}

export interface IPaginatedInvoices {
    invoices: IInvoice[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
    summary: {
        total_amount: number;
        paid_amount: number;
        pending_amount: number;
        overdue_amount: number;
        count_by_status: Record<string, number>;
    };
}

export interface IInvoiceStats {
    total_invoices: number;
    total_amount: number;
    paid_amount: number;
    pending_amount: number;
    overdue_amount: number;
    average_amount: number;
    average_payment_delay: number;
    conversion_rate: number;
    status_distribution: Record<string, number>;
    payment_method_distribution: Record<string, number>;
    monthly_stats: {
        month: string;
        count: number;
        amount: number;
        paid_amount: number;
    }[];
}

export interface IInvoiceReminder {
    invoice_id: string;
    type: "first" | "second" | "final" | "legal";
    days_overdue: number;
    email_template?: string;
    send_email: boolean;
    additional_message?: string;
}

export interface IInvoiceExportOptions {
    format: "PDF" | "CSV" | "XLSX" | "JSON";
    include_items: boolean;
    include_payments: boolean;
    include_customer_details: boolean;
    template_id?: string;
    language?: string;
    filters?: IInvoiceQueryParams;
}

export interface IBulkInvoiceAction {
    action:
        | "send"
        | "mark_paid"
        | "mark_cancelled"
        | "send_reminder"
        | "export"
        | "delete";
    invoice_ids: string[];
    options?: {
        email_template?: string;
        payment_date?: Date;
        payment_method?: string;
        payment_reference?: string;
        reminder_type?: string;
        export_format?: string;
    };
}
