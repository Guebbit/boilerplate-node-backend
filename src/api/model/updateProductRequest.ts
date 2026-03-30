/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

export interface UpdateProductRequest {
    /**
    * Resource identifier
    */
    id: string;
    title: string;
    description?: string;
    price: number;
    imageUrl?: string;
    active?: boolean;
}

