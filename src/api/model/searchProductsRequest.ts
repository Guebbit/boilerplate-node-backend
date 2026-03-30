/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

export interface SearchProductsRequest {
    /**
    * 1-based page index
    */
    page?: number;
    /**
    * Optional override; server may clamp to a max
    */
    pageSize?: number;
    /**
    * Free-text search string
    */
    text?: string;
    /**
    * Resource identifier
    */
    id?: string;
    minPrice?: number;
    maxPrice?: number;
}

