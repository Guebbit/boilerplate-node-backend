/**
 * The analytics event names this module emits.
 *
 * Discovery, not purchase: a search and a product view are the top of the funnel, and their ratio
 * to `CART_ITEM_ADDED` is what says whether the catalogue is doing its job.
 *
 * Declared by augmenting the analytics port's name map rather than by editing a shared file,
 * exactly as `./audit.ts` does for audit actions: the catalogue grows with the modules that own
 * their names, and `infrastructure` keeps knowing no domain at all.
 *
 * These names stay HERE. Nothing publishes them: the controllers that fire them import this file
 * directly, so a copy would have no reader on either side of the repo boundary. Only
 * `shared/contracts/analytics.frontend.ts` — the moments this service never observes — is
 * published to the paired frontend, which is what keeps one event from being counted twice.
 */

export const productsAnalyticsEvents = {
    // Product discovery
    PRODUCTS_SEARCHED: 'products_searched',
    PRODUCT_VIEWED: 'product_viewed'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        products: (typeof productsAnalyticsEvents)[keyof typeof productsAnalyticsEvents];
    }
}
