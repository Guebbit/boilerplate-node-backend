/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * One action: the courier tick is the only request-shaped thing delivery does. The shipment
 * creation itself rides the order status change, which the admin order write already audits.
 */

export const deliveryAuditActions = {
    ADMIN_COURIER_ADVANCED: 'admin.courier.advanced'
} as const;

declare module '@infrastructure/observability/audit' {
    interface IAuditActionMap {
        delivery: (typeof deliveryAuditActions)[keyof typeof deliveryAuditActions];
    }
}
