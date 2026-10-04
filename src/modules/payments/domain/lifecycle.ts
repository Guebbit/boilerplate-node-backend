/**
 * @module
 * The payment lifecycle — which status each write funnelling through `services/settlement.ts`'s
 * `settlePayment` may run FROM. Every read here backs a conditional write
 * (`repository.ts`'s `updateStatusIfIn`/`upsertConfirmable`), so membership in one of these sets
 * IS the guard, not a comment beside it.
 *
 * No explicit `from → to` graph the way `orders/domain/lifecycle.ts` walks one: every payment
 * transition already funnels through the one function that decides where it lands
 * (`settlePayment`), so nothing here ever asks "to what" — only "may I still move this payment".
 *
 * Each set below is an ARRAY, not a `Set`: it is read both as a membership test and as the `$in`
 * of the conditional write that re-asserts it while mongod holds the document, and a `Set` would
 * need re-spreading for the second.
 *
 * See: docs/theory/tactical-ddd.md
 */

import { RefundStatus, type PaymentStatus } from '@types';

/**
 * The statuses `confirmPayment` may run from — a fresh intent, or one the provider previously
 * declined. `requires_action`/`processing` are absent: a payment already in flight at the
 * provider is resolved by re-reading it (`syncPayment`), never by attaching a second method to
 * it.
 */
export const CONFIRMABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    'requires_confirmation',
    'declined'
];

/**
 * The statuses a settlement (confirm, sync, or the provider's webhook) may move a payment away
 * from — every non-terminal one. `succeeded` and `refunded` are absent, which is what makes
 * `settlePayment` at-most-once: a webhook retried after either has landed finds nothing left to
 * move.
 */
export const SETTLEABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    'requires_confirmation',
    'requires_action',
    'processing',
    'declined'
];

/** The only status money can come back from: it has to have arrived first. */
export const REFUNDABLE_PAYMENT_STATUS: PaymentStatus = 'succeeded';

/**
 * The refund statuses that are still open: `pending` while the provider is being asked, `failed`
 * because the sweep retries it with the same key. `succeeded` is absent — that is what lets a
 * settle or a fail write land only once.
 */
export const OPEN_REFUND_STATUSES: readonly RefundStatus[] = [
    RefundStatus.pending,
    RefundStatus.failed
];
