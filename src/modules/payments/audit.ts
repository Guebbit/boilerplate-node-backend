/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. `admin.` marks the refund because it is genuinely admin-only, unlike confirm/fail which any
 * checkout can produce. `PAYMENT_RECORDED_OFFLINE` is admin-only too but keeps the plain
 * `payment.` prefix, since it names a kind of payment event rather than an admin override of one.
 *
 * `refundForOrder` (the `ORDER_REFUND_OWED` listener, not only a cancel's compensation) logs a
 * real-provider refund rather than auditing it — there is no request behind it, like the
 * token-cleanup job — but still audits `PAYMENT_REFUND_OWED_BY_HAND` for a hand-paid order left
 * for an operator, since that one needs a human to see it.
 */

/** The audit action strings this module fires, keyed by event. */
export const paymentsAuditActions = {
    PAYMENT_CONFIRMED: 'payment.confirmed',
    PAYMENT_FAILED: 'payment.failed',
    ADMIN_PAYMENT_REFUNDED: 'admin.payment.refunded',
    PAYMENT_RECORDED_OFFLINE: 'payment.recorded_offline',
    /**
     * A cancel owed a refund on a hand-paid order, and the automatic listener left it alone
     * (B1b) — only an operator's own `refundByOrder` may say the cash actually went back.
     */
    PAYMENT_REFUND_OWED_BY_HAND: 'payment.refund_owed_by_hand',
    /**
     * The provider reported `succeeded` for an amount, currency or payment other than the one
     * frozen on the payment. Deliberately not under `security.`: the incident view takes that whole
     * prefix, and this is a money discrepancy to reconcile rather than an attack signal.
     */
    PAYMENT_AMOUNT_MISMATCH: 'payment.amount_mismatch'
} as const;

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        payments: (typeof paymentsAuditActions)[keyof typeof paymentsAuditActions];
    }
}
