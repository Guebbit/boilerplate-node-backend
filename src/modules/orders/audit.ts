/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * No `admin.`/`user.` prefix: `actor_role` is already a mandatory field on every audit record, so
 * repeating it in the name would just be the same fact twice. `order.created` fires from BOTH an
 * admin writing an order directly (`orderService.create`) and a customer's checkout
 * (`@modules/cart`'s `orderConfirm`, via `orderService.recordCreated`) — an order exists either
 * way, and `actor_role` is what tells the two apart on the record, not a second event name. Kept
 * distinct from `cartCheckoutTotal`/`orderCreatedTotal`, which are metrics counting requests to
 * two different routes, not this audit trail's count of orders.
 */

/** The audit action vocabulary this module owns. */
export const ordersAuditActions = {
    ORDER_CREATED: 'order.created',
    ORDER_UPDATED: 'order.updated',
    ORDER_DELETED: 'order.deleted',
    /*
     * The one order write a customer performs. Audited because a cancelled order is a support
     * question with a money answer — who cancelled it, the customer or the shop, decides who owes
     * whom an apology. `actor_role` on the record carries who did it.
     */
    ORDER_CANCELLED: 'order.cancelled'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        orders: (typeof ordersAuditActions)[keyof typeof ordersAuditActions];
    }
}
