/**
 * @module
 * The analytics event names this module emits — the order record's own lifecycle. `CHECKOUT_*`
 * is NOT here: the cart module owns it, since `POST /cart/checkout` reports it.
 *
 * Declared by augmenting the analytics port's name map, as `./audit.ts` does for audit actions,
 * rather than editing a shared file.
 *
 * Naming rule: docs/tools/analytics.md#naming.
 */

/** The event names this module fires, keyed by intent. */
export const ordersAnalyticsEvents = {
    // Orders
    ORDER_CREATED: 'order_created',
    ORDER_CANCELLED: 'order_cancelled',
    /*
     * A reservation timing out unpaid ends an order the same way a customer's cancel does, but is
     * a different fact for a funnel to count: one is a choice, the other is an abandonment nobody
     * confirmed. Same shape as `checkout_completed`/`checkout_failed` — see
     * docs/tools/analytics.md#an-outcome-is-a-different-event-not-a-property.
     */
    ORDER_RESERVATION_EXPIRED: 'order_reservation_expired',
    ORDERS_VIEWED: 'orders_viewed'
} as const;

/** Registers this module's event names into the analytics port's app-wide union. */
declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        orders: (typeof ordersAnalyticsEvents)[keyof typeof ordersAnalyticsEvents];
    }
}
