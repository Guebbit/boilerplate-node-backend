/**
 * @module
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * `admin.` on the refund because it is genuinely admin-only, unlike confirm/fail which any
 * checkout can produce. `refundByOrder` (the operator's standalone refund) is a real admin
 * request and audits `ADMIN_PAYMENT_REFUNDED`. `refundForOrder` (the cancel listener's
 * compensation) has no request to build an event from and logs instead, the same trade the
 * token-cleanup job documents.
 */

export const paymentsAuditActions = {
    PAYMENT_CONFIRMED: 'payment.confirmed',
    PAYMENT_FAILED: 'payment.failed',
    ADMIN_PAYMENT_REFUNDED: 'admin.payment.refunded'
} as const;

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        payments: (typeof paymentsAuditActions)[keyof typeof paymentsAuditActions];
    }
}
