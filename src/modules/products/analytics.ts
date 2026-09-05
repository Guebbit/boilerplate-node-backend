/**
 * @module
 * The analytics event names this module emits, augmenting the analytics port's name map (as
 * `./audit.ts` does for audit actions). A search and a product view are top-of-funnel discovery
 * events, not purchase, and their ratio to `CART_ITEM_ADDED` says whether the catalogue is doing
 * its job. Naming rule: docs/tools/analytics.md#naming.
 */

/** The event names this module fires, keyed by intent. */
export const productsAnalyticsEvents = {
    // Product discovery
    PRODUCTS_SEARCHED: 'products_searched',
    PRODUCT_VIEWED: 'product_viewed'
} as const;

/** Registers this module's event names into the analytics port's app-wide union. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        products: (typeof productsAnalyticsEvents)[keyof typeof productsAnalyticsEvents];
    }
}
