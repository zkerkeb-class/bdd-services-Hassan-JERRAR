export interface ICustomer {
    customer_id: string;
    user_id: string;
    company_id: string;
    type: "individual" | "company";
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country: string;
    notes?: string;
    tags: string[];
    is_active: boolean;
    preferred_language: string;
    payment_terms: number;
    credit_limit?: number;
    tax_exempt: boolean;
    createdAt: Date;
    updatedAt: Date;
    // Relations optionnelles
    business?: IBusinessCustomer;
    individual?: IIndividualCustomer;
}

export interface IBusinessCustomer {
    customer_id: string;
    name: string;
    siret: string;
    siren: string;
    tva_intra?: string;
    tva_applicable: boolean;
    legal_form?: string;
    industry?: string;
    website?: string;
    employee_count?: number;
    annual_revenue?: number;
}

export interface IIndividualCustomer {
    customer_id: string;
    first_name: string;
    last_name: string;
    date_of_birth?: Date;
    gender?: "MALE" | "FEMALE" | "OTHER" | "PREFER_NOT_TO_SAY";
    profession?: string;
}

export interface ICreateCustomerRequest {
    type: "individual" | "company";
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    notes?: string;
    tags?: string[];
    preferred_language?: string;
    payment_terms?: number;
    credit_limit?: number;
    tax_exempt?: boolean;

    // Pour les entreprises
    business?: {
        name: string;
        siret: string;
        siren: string;
        tva_intra?: string;
        tva_applicable: boolean;
        legal_form?: string;
        industry?: string;
        website?: string;
        employee_count?: number;
        annual_revenue?: number;
    };

    // Pour les particuliers
    individual?: {
        first_name: string;
        last_name: string;
        date_of_birth?: Date;
        gender?: string;
        profession?: string;
    };
}

export interface IUpdateCustomerRequest {
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country?: string;
    notes?: string;
    tags?: string[];
    is_active?: boolean;
    preferred_language?: string;
    payment_terms?: number;
    credit_limit?: number;
    tax_exempt?: boolean;

    // Pour les entreprises
    business?: {
        name?: string;
        siret?: string;
        siren?: string;
        tva_intra?: string;
        tva_applicable?: boolean;
        legal_form?: string;
        industry?: string;
        website?: string;
        employee_count?: number;
        annual_revenue?: number;
    };

    // Pour les particuliers
    individual?: {
        first_name?: string;
        last_name?: string;
        date_of_birth?: Date;
        gender?: string;
        profession?: string;
    };
}

export interface ICustomerQueryParams {
    page?: number;
    limit?: number;
    search?: string;
    type?: "individual" | "company";
    tags?: string[];
    is_active?: boolean;
    payment_terms?: number;
    tax_exempt?: boolean;
    city?: string;
    country?: string;
    sortBy?: "createdAt" | "name" | "email" | "payment_terms";
    sortOrder?: "asc" | "desc";
}

export interface IPaginatedCustomers {
    customers: ICustomer[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}

export interface ICustomerStats {
    total: number;
    individual: number;
    company: number;
    active: number;
    inactive: number;
    new_this_month: number;
    top_customers: {
        customer_id: string;
        name: string;
        total_revenue: number;
        invoice_count: number;
    }[];
}

export interface ICustomerActivity {
    customer_id: string;
    total_invoices: number;
    total_quotes: number;
    total_revenue: number;
    last_invoice_date?: Date;
    last_quote_date?: Date;
    last_payment_date?: Date;
    average_payment_delay: number;
    overdue_invoices: number;
}

export interface ICustomerExportOptions {
    format: "CSV" | "XLSX" | "JSON";
    include_business_details: boolean;
    include_individual_details: boolean;
    include_activity: boolean;
    date_range?: {
        start: Date;
        end: Date;
    };
    filters?: ICustomerQueryParams;
}
