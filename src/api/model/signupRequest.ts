/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

export interface SignupRequest {
    email: string;
    username: string;
    imageUrl?: string;
    password: string;
    passwordConfirm: string;
}

