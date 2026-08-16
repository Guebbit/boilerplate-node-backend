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
 * `npm run contracts:bundle` publishes every module's names as
 * `src/infrastructure/observability/analytics-events.ts`, which is byte-identical with the
 * paired frontend's copy. That file is an ARTEFACT — nothing here imports it.
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
