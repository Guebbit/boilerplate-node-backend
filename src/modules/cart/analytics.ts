/**
 * @module
 * The analytics event names this module emits.
 *
 * Checkout is here, not in `orders`, because `POST /cart/checkout` is the endpoint that reports
 * it — a name belongs to the code that emits it. Declared by augmenting the analytics port's name
 * map, same pattern as `./audit.ts` for audit actions, so the catalogue grows with the modules
 * that own their names.
 *
 * Naming rule: docs/tools/analytics.md#naming.
 */

/** The event names this module fires, keyed by intent. */
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

/** Registers this module's event names into the analytics port's app-wide union. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        cart: (typeof cartAnalyticsEvents)[keyof typeof cartAnalyticsEvents];
    }
}
