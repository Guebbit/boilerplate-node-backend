/**
 * Audit actions this module emits. See `modules/account/audit.ts` for why they are declared by
 * augmentation rather than in a shared enum.
 *
 * All three are `user.` actions: even the refund, which no request triggers, compensates a
 * customer's cancel — but having no request to build an event from, the refund logs instead of
 * auditing (the same trade the token-cleanup job documents). It is listed here anyway so the
 * vocabulary names every way money moves.
 */

export const paymentsAuditActions = {
    USER_PAYMENT_SUCCEEDED: 'user.payment.succeeded',
    USER_PAYMENT_DECLINED: 'user.payment.declined',
    USER_PAYMENT_REFUNDED: 'user.payment.refunded'
} as const;

declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        payments: (typeof paymentsAuditActions)[keyof typeof paymentsAuditActions];
    }
}
