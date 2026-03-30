/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

export interface PasswordResetConfirmRequest {
    /**
    * One-time password reset token (NOT a JWT).
    */
    token: string;
    password: string;
    passwordConfirm: string;
}

