/**
 * The analytics event names this module emits.
 *
 * Checkout is here rather than in `orders` because `POST /cart/checkout` is the endpoint that
 * reports it. A name belongs to the code that EMITS it: delete this module and the two checkout
 * outcomes leave the funnel with the endpoint that produced them.
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

export const cartAnalyticsEvents = {
    // Cart
    CART_VIEWED: 'cart_viewed',
    CART_ITEM_ADDED: 'cart_item_added',
    CART_ITEM_UPDATED: 'cart_item_updated',
    CART_ITEM_REMOVED: 'cart_item_removed',
    CART_CLEARED: 'cart_cleared',
    // `POST /cart/reorder/{orderId}` — an old order refilling the cart. A cart event, not an
    // orders one: the order is only read, the cart is what changes.
    CART_REORDERED: 'cart_reordered',

    // Checkout — `POST /cart/checkout` is the endpoint that reports these, so they live with it.
    // A name belongs to the code that emits it: delete this module and the two outcomes leave the
    // funnel with the endpoint that produced them.
    CHECKOUT_COMPLETED: 'checkout_completed',
    CHECKOUT_FAILED: 'checkout_failed'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        cart: (typeof cartAnalyticsEvents)[keyof typeof cartAnalyticsEvents];
    }
}
