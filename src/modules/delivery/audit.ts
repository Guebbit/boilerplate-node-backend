/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 */

/**
 * The four doors staff writes through: starting fulfilment, recording a handover, recording an
 * arrival, and marking a digital-only order fulfilled with no parcel at all.
 */
export const deliveryAuditActions = {
    ADMIN_ORDER_FULFILMENT_STARTED: 'admin.order.fulfilment_started',
    ADMIN_ORDER_SHIPPED: 'admin.order.shipped',
    ADMIN_ORDER_DELIVERED: 'admin.order.delivered',
    ADMIN_ORDER_FULFILLED: 'admin.order.fulfilled'
} as const;

/** Registers this module's action shape into the shared `AuditActionMap`. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        delivery: (typeof deliveryAuditActions)[keyof typeof deliveryAuditActions];
    }
}
