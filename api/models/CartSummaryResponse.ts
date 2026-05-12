/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CartSummaryResponse = {
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
};

