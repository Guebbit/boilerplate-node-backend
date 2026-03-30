/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

export interface UpdateProductRequestBody {
    /**
    * Resource identifier
    */
    id: string;
    title: string;
    description?: string;
    price: string;
    imageUrl?: string;
    active?: string;
}

