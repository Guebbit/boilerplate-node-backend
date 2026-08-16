/**
 * The analytics event names this module emits.
 *
 * The order record's own lifecycle. Note that `CHECKOUT_*` is NOT here: the cart module owns it,
 * because `POST /cart/checkout` is what reports it. The paired frontend emits `ORDER_*` from its
 * orders store, which is why ownership is a per-repo mapping while the NAMES are shared.
 *
 * Declared by augmenting the analytics port's name map rather than by editing a shared file,
 * exactly as `./audit.ts` does for audit actions: the catalogue grows with the modules that own
 * their names, and `infrastructure` keeps knowing no domain at all.
 *
 * `npm run contracts:analytics` publishes every module's names as
 * `src/infrastructure/observability/analytics-events.ts`, which is byte-identical with the
 * paired frontend's copy. That file is an ARTEFACT — nothing here imports it.
 */

export const ordersAnalyticsEvents = {
    // Orders
    ORDER_CREATED: 'order_created',
    ORDER_CANCELLED: 'order_cancelled',
    ORDERS_VIEWED: 'orders_viewed'
} as const;

declare module '@infrastructure/observability/analytics' {
    interface AnalyticsEventMap {
        orders: (typeof ordersAnalyticsEvents)[keyof typeof ordersAnalyticsEvents];
    }
}
