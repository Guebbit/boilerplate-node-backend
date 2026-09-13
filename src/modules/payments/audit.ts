/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. `admin.` marks the refund because it is genuinely admin-only, unlike confirm/fail which any
 * checkout can produce; `refundForOrder` (the cancel listener's compensation) has no request to
 * audit and logs instead, like the token-cleanup job.
 */

/** The audit action strings this module fires, keyed by event. */
export const paymentsAuditActions = {
    PAYMENT_CONFIRMED: 'payment.confirmed',
    PAYMENT_FAILED: 'payment.failed',
    ADMIN_PAYMENT_REFUNDED: 'admin.payment.refunded'
} as const;

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        payments: (typeof paymentsAuditActions)[keyof typeof paymentsAuditActions];
    }
}
