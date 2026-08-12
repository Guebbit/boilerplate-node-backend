/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * `admin.order.created` covers an order an admin writes directly. An order created by a customer
 * checking out is `cart`'s event, not this module's — the two are counted separately for the same
 * reason `cartCheckoutTotal` and `orderCreatedTotal` are separate counters.
 */

export const ordersAuditActions = {
    ADMIN_ORDER_CREATED: 'admin.order.created',
    ADMIN_ORDER_UPDATED: 'admin.order.updated',
    ADMIN_ORDER_DELETED: 'admin.order.deleted'
} as const;

declare module '@infrastructure/observability/audit' {
    interface IAuditActionMap {
        orders: (typeof ordersAuditActions)[keyof typeof ordersAuditActions];
    }
}
