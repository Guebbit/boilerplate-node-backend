/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * `admin.` on the refund because it is genuinely admin-only, unlike confirm/fail which any
 * checkout can produce. The refund itself, which no request triggers, compensates a customer's
 * cancel — but having no request to build an event from, the refund logs instead of auditing (the
 * same trade the token-cleanup job documents). It is listed here anyway so the vocabulary names
 * every way money moves.
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
