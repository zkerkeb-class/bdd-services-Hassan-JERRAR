export interface ICompany {
    company_id: string;
    name: string;
    siret: string;
    tva_intra?: string;
    tva_applicable: boolean;
    RCS_number: string;
    RCS_city: string;
    capital?: number;
    siren: string;
    legal_form:
        | "SAS"
        | "SARL"
        | "SA"
        | "SASU"
        | "EURL"
        | "SNC"
        | "SOCIETE_CIVILE"
        | "ENTREPRISE_INDIVIDUELLE"
        | "MICRO_ENTREPRISE"
        | "AUTO_ENTREPRENEUR"
        | "EI"
        | "EIRL";
    address: string;
    postal_code: string;
    city: string;
    country: string;
    email?: string;
    phone?: string;
    website?: string;
    logo_url?: string;
    description?: string;
    industry?: string;
    employee_count?: number;
    annual_revenue?: number;
    timezone: string;
    currency: string;
    language: string;
    is_active: boolean;
    createdAt: Date;
    updatedAt: Date;
}

export interface ICreateCompanyRequest {
    name: string;
    siret: string;
    tva_intra?: string;
    tva_applicable: boolean;
    RCS_number: string;
    RCS_city: string;
    capital?: number;
    siren: string;
    legal_form: string;
    address: string;
    postal_code: string;
    city: string;
    country?: string;
    email?: string;
    phone?: string;
    website?: string;
    description?: string;
    industry?: string;
    employee_count?: number;
    annual_revenue?: number;
    timezone?: string;
    currency?: string;
    language?: string;
}

export interface IUpdateCompanyRequest {
    name?: string;
    siret?: string;
    tva_intra?: string;
    tva_applicable?: boolean;
    RCS_number?: string;
    RCS_city?: string;
    capital?: number;
    legal_form?: string;
    address?: string;
    postal_code?: string;
    city?: string;
    country?: string;
    email?: string;
    phone?: string;
    website?: string;
    logo_url?: string;
    description?: string;
    industry?: string;
    employee_count?: number;
    annual_revenue?: number;
    timezone?: string;
    currency?: string;
    language?: string;
    is_active?: boolean;
}

export interface ICompanySettings {
    id: string;
    company_id: string;
    invoice_prefix: string;
    quote_prefix: string;
    invoice_numbering:
        | "AUTO_INCREMENT"
        | "YEARLY_RESET"
        | "MONTHLY_RESET"
        | "CUSTOM";
    quote_numbering:
        | "AUTO_INCREMENT"
        | "YEARLY_RESET"
        | "MONTHLY_RESET"
        | "CUSTOM";
    next_invoice_number: number;
    next_quote_number: number;
    default_payment_terms: number;
    default_currency: string;
    default_language: string;
    default_vat_rate: string;
    late_fee_percentage?: number;
    late_fee_fixed?: number;
    auto_send_reminders: boolean;
    reminder_schedule?: Record<string, any>;
    email_templates?: Record<string, any>;
    invoice_template?: string;
    quote_template?: string;
    logo_url?: string;
    signature_url?: string;
    bank_details?: Record<string, any>;
    fiscal_year_start: number;
    timezone: string;
    date_format: string;
    number_format: string;
}

export interface IUpdateCompanySettingsRequest {
    invoice_prefix?: string;
    quote_prefix?: string;
    invoice_numbering?: string;
    quote_numbering?: string;
    next_invoice_number?: number;
    next_quote_number?: number;
    default_payment_terms?: number;
    default_currency?: string;
    default_language?: string;
    default_vat_rate?: string;
    late_fee_percentage?: number;
    late_fee_fixed?: number;
    auto_send_reminders?: boolean;
    reminder_schedule?: Record<string, any>;
    email_templates?: Record<string, any>;
    invoice_template?: string;
    quote_template?: string;
    logo_url?: string;
    signature_url?: string;
    bank_details?: Record<string, any>;
    fiscal_year_start?: number;
    timezone?: string;
    date_format?: string;
    number_format?: string;
}

export interface ICompanyQueryParams {
    page?: number;
    limit?: number;
    search?: string;
    industry?: string;
    legal_form?: string;
    is_active?: boolean;
    sortBy?: "name" | "createdAt" | "employee_count" | "annual_revenue";
    sortOrder?: "asc" | "desc";
}

export interface IPaginatedCompanies {
    companies: ICompany[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPreviousPage: boolean;
}
