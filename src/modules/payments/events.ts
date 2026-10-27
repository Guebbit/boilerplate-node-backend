/**
 * @module
 * Domain events this module emits, added by augmenting the kernel's payload map — see
 * `modules/orders/events.ts` for why augmentation rather than a central list. `payment.succeeded` and
 * `payment.failed` are emitted from `settlePayment`, the one place a payment is reconciled
 * (`./services/settlement`); `payment.refunded` comes from `./services/refunds.ts`.
 */

import type { RefundFailureReason } from '@types';

/** Registers this module's event payloads into the kernel's app-wide `DomainEventMap`. */
declare module '@kernel/events' {
    interface DomainEventMap {
        /**
         * A payment settled. Emitted alongside `order.status_changed` (`to: 'paid'`), from the
         * same at-most-once write — `webhooks` is the first listener that needs this as its own
         * fact rather than inferred from the order's status.
         *
         * Delivered through the transactional outbox (`./services/announce.ts`), not emitted inline:
         * at-least-once, so a listener dedupes on `meta.eventId`. It can arrive after the
         * settlement's response, and — when a settlement died after charging — minutes later.
         */
        'payment.succeeded': { paymentId: string; orderId: string };

        /**
         * The provider declined the method. Retryable with another method (see
         * `CONFIRMABLE_PAYMENT_STATUSES`), so this can fire more than once for the same order —
         * each attempt is its own fact, same as `paymentsAuditActions.PAYMENT_FAILED`.
         *
         * Delivered through the transactional outbox (`./services/announce.ts`'s `recordDecline`),
         * written with the `declined` status move: at-least-once, so a listener dedupes on
         * `meta.eventId`.
         */
        'payment.failed': { paymentId: string; orderId: string };

        /**
         * One refund settled — emitted from `./services/refunds.ts`'s `settleRefund`, on the same
         * at-most-once write, whether an operator asked for it (`refundPayment`) or the automatic
         * `order.cancelled` listener did. A payment can raise it more than once: each partial
         * refund is its own fact. `invoicing` is the listener that issues a credit note from it —
         * see `docs/modules/invoicing.md`. Absent while a hand-paid refund waits for an operator
         * (`leaveForOperator`): its record is open and nothing has settled yet.
         *
         * `amount` is THIS refund's, not the payment's. `full` says the refund is the whole payment,
         * the one case where a credit note mirrors the invoice instead of apportioning it.
         *
         * Delivered through the transactional outbox, written in the transaction that settles the
         * refund record (`./services/refunds.ts`): at-least-once, so a listener dedupes on
         * `meta.eventId`.
         */
        'payment.refunded': {
            paymentId: string;
            orderId: string;
            refundId: string;
            /** The return this refund pays for, when it is one — `returns` closes it on this. */
            returnId?: string;
            /**
             * The goods and delivery this refund pays back, when it pays for specific ones — so
             * `invoicing` credits each line at its own VAT rate. Absent for goodwill and
             * cancellation refunds, which a credit note spreads across every rate instead.
             */
            goods?: {
                lines: { productId: string; quantity: number }[];
                /** The delivery cost inside `amount`, a decimal. */
                shipping: number;
            };
            amount: number;
            currency: string;
            full: boolean;
        };

        /**
         * Staff voided a refund that must never be paid (`./services/refunds.ts`'s `cancelRefund`).
         * No money moved and none will: the record is closed and its share is refundable again.
         * Nothing is credited and no webhook carries it; a staff ticket or attention row that
         * waited on that refund closes on it.
         *
         * Delivered through the transactional outbox, written in the transaction that voids the
         * record: at-least-once, so a listener dedupes on `meta.eventId`.
         */
        'payment.refund_canceled': {
            paymentId: string;
            orderId: string;
            refundId: string;
            amount: number;
            currency: string;
        };

        /**
         * The provider refused a refund, or reported one failed. `final` says whether the refusal
         * ends the retrying (`FINAL_REFUND_FAILURES`): the money has to go back another way, and the
         * buyer is told so. A transient refusal (`final: false`) is retried by the sweep and only
         * worth a digest line. Emitted once per NEW refusal (the first, or a changed reason), so a
         * retry that fails the same way is silent.
         *
         * `failureReason` is the closed code, never the provider's wording.
         *
         * Delivered through the transactional outbox, written in the transaction that records the
         * refusal: at-least-once, so a listener dedupes on `meta.eventId`.
         */
        'payment.refund_failed': {
            paymentId: string;
            orderId: string;
            refundId: string;
            amount: number;
            currency: string;
            failureReason: RefundFailureReason;
            final: boolean;
        };

        /**
         * The provider took back a refund it had settled (a bank sent the money back). The credit
         * note and a closed return stay; the record is open again and owed another way until staff
         * mark it returned, which fires `payment.refunded` once more for the same `refundId`.
         *
         * Delivered through the transactional outbox, written in the transaction that reverses the
         * record: at-least-once, so a listener dedupes on `meta.eventId`.
         */
        'payment.refund_reversed': {
            paymentId: string;
            orderId: string;
            refundId: string;
            amount: number;
            currency: string;
            failureReason: RefundFailureReason;
        };
    }
}

/** See `DomainEventMap['payment.succeeded']` above. */
export const PAYMENT_SUCCEEDED = 'payment.succeeded';

/** See `DomainEventMap['payment.failed']` above. */
export const PAYMENT_FAILED = 'payment.failed';

/** See `DomainEventMap['payment.refunded']` above. */
export const PAYMENT_REFUNDED = 'payment.refunded';

/** See `DomainEventMap['payment.refund_canceled']` above. */
export const PAYMENT_REFUND_CANCELED = 'payment.refund_canceled';

/** See `DomainEventMap['payment.refund_failed']` above. */
export const PAYMENT_REFUND_FAILED = 'payment.refund_failed';

/** See `DomainEventMap['payment.refund_reversed']` above. */
export const PAYMENT_REFUND_REVERSED = 'payment.refund_reversed';
