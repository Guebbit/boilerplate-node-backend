/**
 * Ecommerce Demo API
 * Stable, codegen-oriented OpenAPI contract. Designed for multi-project, multi-language use (client/server stubs, DTOs, SDKs).
 *
 * The version of the OpenAPI document: 2.0.0
 *
 *
 */

export interface CartSummaryResponse {
    /**
    * Number of distinct cart lines/items
    */
    itemsCount: number;
    /**
    * Sum of quantities across all items
    */
    totalQuantity: number;
    /**
    * Sum of item prices * quantity (before tax/shipping/discounts)
    */
    total: number;
    /**
    * ISO-4217 currency code (e.g. USD)
    */
    currency?: string;
}

