/**
 * @module
 * Analytics event names this module emits — a save funnel with one exit into the purchase funnel.
 * Naming rule: docs/tools/analytics.md#naming.
 *
 * Declared by augmenting the analytics port's name map, same pattern as `./audit.ts` for audit
 * actions. These names stay here rather than being published to the frontend — only the moments
 * this service never observes go through `shared/contracts/analytics.frontend.ts`, which keeps one
 * event from being counted twice.
 */

/** The event names this module fires, keyed by intent. */
export const wishlistAnalyticsEvents = {
    // Wishlist
    WISHLIST_ITEM_ADDED: 'wishlist_item_added',
    WISHLIST_ITEM_REMOVED: 'wishlist_item_removed',
    // The wishlist's exit — the event that ties the save funnel to the purchase funnel.
    WISHLIST_MOVED_TO_CART: 'wishlist_moved_to_cart'
} as const;

/** Registers this module's event names into the analytics port's app-wide union. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        wishlist: (typeof wishlistAnalyticsEvents)[keyof typeof wishlistAnalyticsEvents];
    }
}
