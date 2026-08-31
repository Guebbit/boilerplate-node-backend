/**
 * @module
 * Audit actions this module emits, declared by augmentation rather than a shared enum — see
 * `modules/account/audit.ts`. No `admin.`/`user.` prefix: `actor_role` on every record already
 * tells who did it, so `order.created` fires from both an admin write and a customer checkout,
 * not two different actions. Distinct from `cartCheckoutTotal`/`orderCreatedTotal`, which count
 * route requests, not this audit trail's orders.
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
