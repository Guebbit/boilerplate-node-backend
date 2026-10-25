/**
 * @module
 * Audit actions this module emits, declared by augmentation — see `modules/account/audit.ts` for
 * why. `admin.` marks the refund because it is genuinely admin-only, unlike confirm/fail which any
 * checkout can produce. `PAYMENT_RECORDED_OFFLINE` is admin-only too but keeps the plain
 * `payment.` prefix, since it names a kind of payment event rather than an admin override of one.
 *
 * `refundForOrder` (the refund half of the `order.cancelled` listener) logs a
 * real-provider refund rather than auditing it — there is no request behind it, like a sweep —
 * but still audits `PAYMENT_REFUND_OWED_BY_HAND` for a hand-paid refund left
 * for an operator, since that one needs a human to see it.
 */

import { registerSecurityEvents } from '@infrastructure/observability/security-events';

/** The audit action strings this module fires, keyed by event. */
export const paymentsAuditActions = {
    PAYMENT_CONFIRMED: 'payment.confirmed',
    PAYMENT_FAILED: 'payment.failed',
    ADMIN_PAYMENT_REFUNDED: 'admin.payment.refunded',
    /**
     * A caller asked for a refund and its record opened — before the provider is asked, so the
     * decision is on file even when the provider refuses and the sweep sends the money later, with
     * no caller behind it. `ADMIN_PAYMENT_REFUNDED` is the settlement, which a sweep never audits.
     */
    ADMIN_PAYMENT_REFUND_REQUESTED: 'admin.payment.refund_requested',
    /**
     * An operator confirmed that a hand-paid refund's money went back outside the application
     * (`settleRefundByHand`). The only audit row that says so; `ADMIN_PAYMENT_REFUNDED` is a
     * provider refund's settlement.
     */
    ADMIN_PAYMENT_REFUND_SETTLED_BY_HAND: 'admin.payment.refund_settled_by_hand',
    PAYMENT_RECORDED_OFFLINE: 'payment.recorded_offline',
    /**
     * A refund record opened on a hand-paid payment and was left `pending`: the money is
     * cash or a transfer an operator must hand back outside the application, then confirm with
     * `settleRefundByHand`. Written for every way a record opens (a cancel, a late payment on a
     * cancelled order, an operator's refund, a received return, a buyer's withdrawal); the
     * metadata names the record and the money.
     */
    PAYMENT_REFUND_OWED_BY_HAND: 'payment.refund_owed_by_hand',
    /**
     * The provider reported `succeeded` for an amount, currency or payment other than the one
     * frozen on the payment. Deliberately not under `security.`: the incident view takes that whole
     * prefix, and this is a money discrepancy to reconcile rather than an attack signal.
     */
    PAYMENT_AMOUNT_MISMATCH: 'payment.amount_mismatch',
    /** A provider webhook whose signature did not verify: a forgery, so it is also counted. */
    SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE: 'security.payment_webhook.invalid_signature'
} as const;

registerSecurityEvents([paymentsAuditActions.SECURITY_PAYMENT_WEBHOOK_INVALID_SIGNATURE]);

/** Augments infrastructure's audit action map with this module's own action strings. */
declare module '@infrastructure/observability/audit' {
    interface AuditActionMap {
        payments: (typeof paymentsAuditActions)[keyof typeof paymentsAuditActions];
    }
}
