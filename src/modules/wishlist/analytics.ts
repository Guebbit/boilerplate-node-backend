/**
 * The analytics event names this module emits.
 *
 * A save funnel with one exit into the purchase funnel, which is the event worth watching.
 *
 * Declared by augmenting the analytics port's name map rather than by editing a shared file,
 * exactly as `./audit.ts` does for audit actions: the catalogue grows with the modules that own
 * their names, and `infrastructure` keeps knowing no domain at all.
 *
 * `npm run contracts:bundle` publishes every module's names as
 * `src/infrastructure/observability/analytics-events.ts`, which is byte-identical with the
 * paired frontend's copy. That file is an ARTEFACT — nothing here imports it.
 */

export const wishlistAnalyticsEvents = {
    // Wishlist
    WISHLIST_ITEM_ADDED: 'wishlist_item_added',
    WISHLIST_ITEM_REMOVED: 'wishlist_item_removed',
    // The wishlist's exit — the event that ties the save funnel to the purchase funnel.
    WISHLIST_MOVED_TO_CART: 'wishlist_moved_to_cart'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        wishlist: (typeof wishlistAnalyticsEvents)[keyof typeof wishlistAnalyticsEvents];
    }
}
