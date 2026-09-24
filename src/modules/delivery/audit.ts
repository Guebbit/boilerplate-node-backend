/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 */

/** The two doors staff writes through: recording a handover, and recording an arrival. */
export const deliveryAuditActions = {
    ADMIN_ORDER_SHIPPED: 'admin.order.shipped',
    ADMIN_ORDER_DELIVERED: 'admin.order.delivered'
} as const;

/** Registers this module's action shape into the shared `AuditActionMap`. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        delivery: (typeof deliveryAuditActions)[keyof typeof deliveryAuditActions];
    }
}
