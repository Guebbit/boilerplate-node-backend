/**
 * The analytics event names this module emits.
 *
 * A save funnel with one exit into the purchase funnel, which is the event worth watching.
 *
 * Naming rule: docs/tools/analytics.md#naming.
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
