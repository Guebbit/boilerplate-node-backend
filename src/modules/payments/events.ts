/**
 * @module
 * Domain events this module emits, declared in `./asyncapi.domain-events.yaml`. `payment.succeeded` and
 * `payment.failed` are emitted from `settlePayment`, the one place a payment is reconciled
 * (`./services/settlement`); `payment.refunded` comes from `./services/refunds.ts`.
 */

import type { DomainEventMap, DomainEventName } from '@kernel/events';

/**
 * What both dispute events carry: the dispute as the provider last reported it, never its free
 * text. The generated payload (`asyncapi.domain-events.yaml`), under the name callers use.
 */
export type DisputeEventPayload = DomainEventMap['payment.dispute_opened'];

/** See the `payment.succeeded` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_SUCCEEDED = 'payment.succeeded' satisfies DomainEventName;

/** See the `payment.failed` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_FAILED = 'payment.failed' satisfies DomainEventName;

/** See the `payment.refunded` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_REFUNDED = 'payment.refunded' satisfies DomainEventName;

/** See the `payment.refund_canceled` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_REFUND_CANCELED = 'payment.refund_canceled' satisfies DomainEventName;

/** See the `payment.refund_failed` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_REFUND_FAILED = 'payment.refund_failed' satisfies DomainEventName;

/** See the `payment.refund_reversed` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_REFUND_REVERSED = 'payment.refund_reversed' satisfies DomainEventName;

/** See the `payment.dispute_opened` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_DISPUTE_OPENED = 'payment.dispute_opened' satisfies DomainEventName;

/** See the `payment.dispute_updated` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_DISPUTE_UPDATED = 'payment.dispute_updated' satisfies DomainEventName;

/** See the `payment.refund_owed_after_dispute` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_REFUND_OWED_AFTER_DISPUTE =
    'payment.refund_owed_after_dispute' satisfies DomainEventName;

/** See the `payment.refund_owed_by_hand` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_REFUND_OWED_BY_HAND = 'payment.refund_owed_by_hand' satisfies DomainEventName;

/** See the `payment.amount_mismatch` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_AMOUNT_MISMATCH = 'payment.amount_mismatch' satisfies DomainEventName;

/** See the `payment.refund_unrecorded` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_REFUND_UNRECORDED = 'payment.refund_unrecorded' satisfies DomainEventName;

/** See the `payment.return_refund_short` channel in `asyncapi.domain-events.yaml`. */
export const PAYMENT_RETURN_REFUND_SHORT = 'payment.return_refund_short' satisfies DomainEventName;
