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
         * A `succeeded` payment moved to `refunded` — emitted from `./services/refunds.ts`'s
         * `markRefunded`, on the same at-most-once write, whether an operator asked for it
         * (`refundByOrder`) or the automatic `ORDER_REFUND_OWED` compensation did. `invoicing` is
         * the one listener today, issuing the order's credit note from this fact — see
         * `docs/modules/invoicing.md`. Absent for a hand-paid refund left for an operator
         * (`leaveForOperator`): the payment never actually moved to `refunded` there.
         */
        'payment.refunded': {
            paymentId: string;
            orderId: string;
            amount: number;
            currency: string;
        };
    }
}

/** See `DomainEventMap['payment.succeeded']` above. */
export const PAYMENT_SUCCEEDED = 'payment.succeeded';

/** See `DomainEventMap['payment.failed']` above. */
export const PAYMENT_FAILED = 'payment.failed';

/** See `DomainEventMap['payment.refunded']` above. */
export const PAYMENT_REFUNDED = 'payment.refunded';
