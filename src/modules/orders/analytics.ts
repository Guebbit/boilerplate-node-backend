/**
 * The analytics event names this module emits.
 *
 * The order record's own lifecycle. Note that `CHECKOUT_*` is NOT here: the cart module owns it,
 * because `POST /cart/checkout` is what reports it. The paired frontend emits `ORDER_*` from its
 * orders store, which is why ownership is a per-repo mapping while the NAMES are shared.
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

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        orders: (typeof ordersAnalyticsEvents)[keyof typeof ordersAnalyticsEvents];
    }
}
