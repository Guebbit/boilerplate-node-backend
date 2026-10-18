/**
 * @module
 * Audit actions this module emits, declared by augmentation rather than a shared enum — see
 * `modules/account/audit.ts`. No `admin.`/`user.` prefix: `actorRole` on every record already
 * tells who did it, so `order.created` fires from both an admin write and a customer checkout,
 * not two different actions. Distinct from `cartCheckoutTotal`/`orderCreatedTotal`, which count
 * route requests, not this audit trail's orders.
 */

/** The audit action vocabulary this module owns. */
export const ordersAuditActions = {
    /** Staff opened someone else's order — `admin.` because only the wide read produces it. */
    ADMIN_ORDER_VIEWED: 'admin.order.viewed',
    /* Every customer's orders left the application as a file. `metadata` carries the filter and the row count, never a row. */
    ADMIN_ORDERS_EXPORTED: 'admin.orders.exported',
    ORDER_CREATED: 'order.created',
    ORDER_UPDATED: 'order.updated',
    ORDER_DELETED: 'order.deleted',
    ORDER_RESTORED: 'order.restored',
    /*
     * The one order write a customer performs. Audited because a cancelled order is a support
     * question with a money answer — who cancelled it, the customer or the shop, decides who owes
     * whom an apology. `actorRole` on the record carries who did it; `metadata` carries `cause`,
     * `refund` (whether the money went back) and `paid` (whether there was money to return).
     */
    ORDER_CANCELLED: 'order.cancelled',
    /* An admin skipped or corrected the normal lifecycle. `metadata` carries mode/from/to/reason. */
    ORDER_STATUS_OVERRIDDEN: 'order.status_overridden',
    /* Staff changed where an unshipped order ships. `metadata` never carries the address itself. */
    ADMIN_ORDER_ADDRESS_CORRECTED: 'admin.order.address_corrected'
} as const;

/** Registers this module's actions into the app-wide `AuditActionMap` union. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        orders: (typeof ordersAuditActions)[keyof typeof ordersAuditActions];
    }
}
