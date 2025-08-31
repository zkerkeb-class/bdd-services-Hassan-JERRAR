import { Request } from "express";

export interface IUser {
    id: string;
    email: string;
    name: string;
    company_id?: string;
    first_name: string;
    last_name: string;
    role: "ADMIN" | "MANAGER" | "USER" | "ACCOUNTANT" | "SALES" | "READONLY";
    status: "ACTIVE" | "INACTIVE" | "SUSPENDED" | "PENDING";
    stripe_account_id?: string;
    stripe_onboarded: boolean;
    onboarding_completed: boolean;
    phone?: string;
    position?: string;
    department?: string;
    last_login_at?: Date;
    is_active: boolean;
}

export interface AuthRequest extends Request {
    user?: IUser;
}

export interface IAuthToken {
    token: string;
    type: "Bearer";
    expires_in: number;
    user: IUser;
}

export interface ILoginRequest {
    email: string;
    password: string;
    remember_me?: boolean;
}

export interface IRegisterRequest {
    email: string;
    password: string;
    first_name: string;
    last_name: string;
    company_name?: string;
    phone?: string;
    accept_terms: boolean;
}

export interface IPasswordResetRequest {
    email: string;
}

export interface IPasswordUpdateRequest {
    current_password: string;
    new_password: string;
    confirm_password: string;
}

export interface IProfileUpdateRequest {
    first_name?: string;
    last_name?: string;
    phone?: string;
    position?: string;
    department?: string;
    bio?: string;
    preferences?: Record<string, any>;
}
