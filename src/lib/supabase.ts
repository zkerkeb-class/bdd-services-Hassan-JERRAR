import { createClient, SupabaseClient } from "@supabase/supabase-js";
import jwt from "jsonwebtoken";
import logger from "../utils/logger";
import { IUser } from "../interfaces/auth.interface";

// Configuration Supabase
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    throw new Error("Les variables d'environnement Supabase sont requises");
}

// Client Supabase principal (anonyme)
export const supabase: SupabaseClient = createClient(supabaseUrl, supabaseKey);

// Client Supabase avec privilèges administrateur
export const supabaseAdmin: SupabaseClient = createClient(
    supabaseUrl,
    supabaseServiceKey
);

// Service d'authentification Supabase
class SupabaseAuthService {
    private client: SupabaseClient;
    private adminClient: SupabaseClient;

    constructor(client: SupabaseClient, adminClient: SupabaseClient) {
        this.client = client;
        this.adminClient = adminClient;
    }

    // Vérifier et décoder un token JWT Supabase
    async verifyToken(token: string): Promise<IUser | null> {
        try {
            // Retirer le préfixe "Bearer " si présent
            const cleanToken = token.replace(/^Bearer\s+/i, "");

            // Vérifier le token avec Supabase
            const {
                data: { user },
                error,
            } = await this.client.auth.getUser(cleanToken);

            if (error || !user) {
                logger.warn({ error }, "Token Supabase invalide");
                return null;
            }

            // Récupérer les informations utilisateur étendues depuis la base de données
            const userData = await this.getUserData(user.id);

            if (!userData) {
                logger.warn(
                    { userId: user.id },
                    "Utilisateur non trouvé en base"
                );
                return null;
            }

            return userData;
        } catch (error) {
            logger.error({ error }, "Erreur lors de la vérification du token");
            return null;
        }
    }

    // Récupérer les données utilisateur complètes
    async getUserData(userId: string): Promise<IUser | null> {
        try {
            const { data, error } = await this.adminClient
                .from("user")
                .select(
                    `
                    *,
                    Company:companyCompany_id (
                        company_id,
                        name,
                        is_active
                    )
                `
                )
                .eq("id", userId)
                .single();

            if (error || !data) {
                logger.warn({ error, userId }, "Utilisateur non trouvé");
                return null;
            }

            return {
                id: data.id,
                email: data.email,
                name: data.name,
                company_id: data.company_id,
                first_name: data.first_name,
                last_name: data.last_name,
                role: data.role,
                status: data.status,
                stripe_account_id: data.stripe_account_id,
                stripe_onboarded: data.stripe_onboarded,
                onboarding_completed: data.onboarding_completed,
                phone: data.phone,
                position: data.position,
                department: data.department,
                last_login_at: data.last_login_at
                    ? new Date(data.last_login_at)
                    : undefined,
                is_active: data.is_active,
            };
        } catch (error) {
            logger.error(
                { error, userId },
                "Erreur lors de la récupération des données utilisateur"
            );
            return null;
        }
    }

    // Créer un nouvel utilisateur
    async createUser(
        email: string,
        password: string,
        userData: Partial<IUser>
    ): Promise<{ user: any; error: any }> {
        try {
            const { data, error } =
                await this.adminClient.auth.admin.createUser({
                    email,
                    password,
                    email_confirm: true,
                    user_metadata: {
                        first_name: userData.first_name,
                        last_name: userData.last_name,
                        name:
                            userData.name ||
                            `${userData.first_name} ${userData.last_name}`,
                    },
                });

            if (error) {
                logger.error(
                    { error, email },
                    "Erreur lors de la création utilisateur Supabase"
                );
                return { user: null, error };
            }

            logger.info(
                { userId: data.user?.id, email },
                "Utilisateur créé avec succès"
            );
            return { user: data.user, error: null };
        } catch (error) {
            logger.error(
                { error, email },
                "Erreur lors de la création utilisateur"
            );
            return { user: null, error };
        }
    }

    // Mettre à jour un utilisateur
    async updateUser(
        userId: string,
        updates: Partial<IUser>
    ): Promise<{ user: any; error: any }> {
        try {
            const { data, error } =
                await this.adminClient.auth.admin.updateUserById(userId, {
                    email: updates.email,
                    user_metadata: {
                        first_name: updates.first_name,
                        last_name: updates.last_name,
                        name: updates.name,
                        phone: updates.phone,
                        position: updates.position,
                        department: updates.department,
                    },
                });

            if (error) {
                logger.error(
                    { error, userId },
                    "Erreur lors de la mise à jour utilisateur Supabase"
                );
                return { user: null, error };
            }

            logger.info({ userId }, "Utilisateur mis à jour avec succès");
            return { user: data.user, error: null };
        } catch (error) {
            logger.error(
                { error, userId },
                "Erreur lors de la mise à jour utilisateur"
            );
            return { user: null, error };
        }
    }

    // Supprimer un utilisateur
    async deleteUser(userId: string): Promise<{ error: any }> {
        try {
            const { error } = await this.adminClient.auth.admin.deleteUser(
                userId
            );

            if (error) {
                logger.error(
                    { error, userId },
                    "Erreur lors de la suppression utilisateur Supabase"
                );
                return { error };
            }

            logger.info({ userId }, "Utilisateur supprimé avec succès");
            return { error: null };
        } catch (error) {
            logger.error(
                { error, userId },
                "Erreur lors de la suppression utilisateur"
            );
            return { error };
        }
    }

    // Réinitialiser le mot de passe
    async resetPassword(email: string): Promise<{ error: any }> {
        try {
            const { error } = await this.client.auth.resetPasswordForEmail(
                email,
                {
                    redirectTo: process.env.FRONTEND_URL + "/reset-password",
                }
            );

            if (error) {
                logger.error(
                    { error, email },
                    "Erreur lors de la réinitialisation mot de passe"
                );
                return { error };
            }

            logger.info({ email }, "Email de réinitialisation envoyé");
            return { error: null };
        } catch (error) {
            logger.error(
                { error, email },
                "Erreur lors de la réinitialisation mot de passe"
            );
            return { error };
        }
    }

    // Obtenir la liste des utilisateurs (admin)
    async listUsers(
        page: number = 1,
        perPage: number = 1000
    ): Promise<{ users: any[]; error: any }> {
        try {
            const { data, error } = await this.adminClient.auth.admin.listUsers(
                {
                    page,
                    perPage,
                }
            );

            if (error) {
                logger.error(
                    { error },
                    "Erreur lors de la récupération des utilisateurs"
                );
                return { users: [], error };
            }

            return { users: data.users || [], error: null };
        } catch (error) {
            logger.error(
                { error },
                "Erreur lors de la récupération des utilisateurs"
            );
            return { users: [], error };
        }
    }

    // Vérifier les permissions utilisateur
    async checkPermission(
        userId: string,
        action: string,
        resource: string
    ): Promise<boolean> {
        try {
            const user = await this.getUserData(userId);

            if (!user || !user.is_active) {
                return false;
            }

            // Logique de permission basée sur le rôle
            switch (user.role) {
                case "ADMIN":
                    return true; // L'admin peut tout faire

                case "MANAGER":
                    // Les managers peuvent tout faire sauf la gestion des utilisateurs admin
                    if (action === "delete" && resource === "user") {
                        return false;
                    }
                    return true;

                case "ACCOUNTANT":
                    // Les comptables peuvent gérer les factures, devis, clients et produits
                    return [
                        "invoice",
                        "quote",
                        "customer",
                        "product",
                        "payment",
                    ].includes(resource);

                case "SALES":
                    // Les commerciaux peuvent gérer les devis, clients et produits (lecture seule pour factures)
                    if (resource === "invoice") {
                        return ["read", "list"].includes(action);
                    }
                    return ["quote", "customer", "product"].includes(resource);

                case "USER":
                    // Les utilisateurs standards ont des permissions limitées
                    return ["read", "list"].includes(action);

                case "READONLY":
                    // Lecture seule pour tout
                    return ["read", "list"].includes(action);

                default:
                    return false;
            }
        } catch (error) {
            logger.error(
                { error, userId, action, resource },
                "Erreur lors de la vérification des permissions"
            );
            return false;
        }
    }

    // Mettre à jour la dernière connexion
    async updateLastLogin(userId: string): Promise<void> {
        try {
            const { error } = await this.adminClient
                .from("user")
                .update({ last_login_at: new Date().toISOString() })
                .eq("id", userId);

            if (error) {
                logger.error(
                    { error, userId },
                    "Erreur lors de la mise à jour last_login_at"
                );
            }
        } catch (error) {
            logger.error(
                { error, userId },
                "Erreur lors de la mise à jour last_login_at"
            );
        }
    }

    // Vérifier la santé de la connexion Supabase
    async healthCheck(): Promise<boolean> {
        try {
            const { data, error } = await this.client
                .from("user")
                .select("id")
                .limit(1);

            return !error;
        } catch (error) {
            logger.error({ error }, "Échec du health check Supabase");
            return false;
        }
    }
}

// Instance du service d'authentification
const authService = new SupabaseAuthService(supabase, supabaseAdmin);

export default authService;
