/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map — see
 * `modules/orders/events.ts` for why augmentation rather than a central list. Both events are
 * emitted from `settlePayment`, the one place a payment is reconciled (`./services/settlement`).
 */

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A payment settled. Emitted alongside `order.status_changed` (`to: 'paid'`), from the
         * same at-most-once write — `webhooks` is the first listener that needs this as its own
         * fact rather than inferred from the order's status.
         */
        'payment.succeeded': { paymentId: string; orderId: string };

        /**
         * The provider declined the method. Retryable with another method (see
         * `CONFIRMABLE_PAYMENT_STATUSES`), so this can fire more than once for the same order —
         * each attempt is its own fact, same as `paymentsAuditActions.PAYMENT_FAILED`.
         */
        'payment.failed': { paymentId: string; orderId: string };

        /**
         * One refund settled — emitted from `./services/refunds.ts`'s `settleRefund`, on the same
         * at-most-once write, whether an operator asked for it (`refundByOrder`) or the automatic
         * `ORDER_REFUND_OWED` compensation did. A payment can raise it more than once: each partial
         * refund is its own fact. `invoicing` is the listener that issues a credit note from it —
         * see `docs/modules/invoicing.md`. Absent for a hand-paid refund left for an operator
         * (`leaveForOperator`): no refund record exists there.
         *
         * `amount` is THIS refund's, not the payment's. `full` says the refund is the whole payment,
         * the one case where a credit note mirrors the invoice instead of apportioning it.
         */
        'payment.refunded': {
            paymentId: string;
            orderId: string;
            refundId: string;
            /** The return this refund pays for, when it is one — `returns` closes it on this. */
            returnId?: string;
            amount: number;
            currency: string;
            full: boolean;
        };
    }
}

/** See `DomainEventMap['payment.succeeded']` above. */
export const PAYMENT_SUCCEEDED = 'payment.succeeded';

/** See `DomainEventMap['payment.failed']` above. */
export const PAYMENT_FAILED = 'payment.failed';

/** See `DomainEventMap['payment.refunded']` above. */
export const PAYMENT_REFUNDED = 'payment.refunded';
