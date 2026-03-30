/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

export interface Product {
    /**
    * Resource identifier
    */
    id: string;
    title: string;
    price: number;
    description?: string;
    active?: boolean;
    imageUrl?: string;
    createdAt?: Date;
    updatedAt?: Date;
    deletedAt?: Date;
}

