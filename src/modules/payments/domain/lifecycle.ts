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

import { RefundFailureReason, RefundStatus, type PaymentStatus } from '@types';

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
 * The statuses of a payment in flight at the provider: the browser has a challenge to answer
 * (`requires_action`) or the provider has not decided yet (`processing`). The next step is `sync`.
 */
export const IN_FLIGHT_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    'requires_action',
    'processing'
];

/**
 * The statuses a settlement (confirm, sync, or the provider's webhook) may move a payment away
 * from — every non-terminal one. `succeeded` and `cancelled` are absent, which is what makes
 * `settlePayment` at-most-once: a webhook retried after `succeeded` has landed finds nothing left
 * to move, and a late `processing` or `declined` report cannot reopen a cancelled intent.
 */
export const SETTLEABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    'requires_confirmation',
    'requires_action',
    'processing',
    'declined'
];

/**
 * The statuses the SUCCESS write may run from: the settleable ones plus `cancelled`. Money that
 * lands on a cancelled intent is real, so it is recorded and (the order being gone) returned in
 * the same transaction. Only the success write, the amount-mismatch write and the provider
 * re-read's gate use this; every other write stays on {@link SETTLEABLE_PAYMENT_STATUSES}.
 */
export const SUCCESS_SETTLEABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    ...SETTLEABLE_PAYMENT_STATUSES,
    'cancelled'
];

/**
 * The statuses the retention reaper may delete: attempts that never became money. An allow-list,
 * so a money status added later is never deleted by default.
 */
export const REAPABLE_PAYMENT_STATUSES: readonly PaymentStatus[] = [
    ...SETTLEABLE_PAYMENT_STATUSES,
    'cancelled'
];

/** The `provider` of a payment an operator recorded by hand: no PSP is behind it. */
export const MANUAL_PROVIDER = 'manual';

/**
 * Whether a payment was recorded by hand. Such money has no provider to report figures, to refund
 * through or to close an intent at: the amount is the order's own, and returning it is an
 * operator's act.
 * @param payment - anything carrying the payment's `provider`
 */
export const isHandRecorded = (payment: { provider: string }): boolean =>
    payment.provider === MANUAL_PROVIDER;

/**
 * Whether a payment is a bank transfer still waiting for its money: hand-recorded, `requires_action`
 * and carrying its reference. A buyer may still take it over with a card, so it counts as payable.
 * @param payment - anything carrying the payment's `provider`, `status` and `transferReference`
 */
export const isOpenTransfer = (payment: {
    provider: string;
    status: PaymentStatus;
    transferReference?: string;
}): boolean =>
    isHandRecorded(payment) &&
    payment.status === 'requires_action' &&
    payment.transferReference !== undefined;

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

/**
 * Whether a refund record is still open: asked or being asked (`pending`), or refused and left for
 * the sweep or an operator (`failed`). A staff-canceled record is `failed` too but closed for good:
 * it is never sent, never settled and holds no money.
 *
 * @param refund - the refund record
 */
export const isOpenRefund = (refund: {
    status: RefundStatus;
    failureReason?: RefundFailureReason;
}): boolean =>
    OPEN_REFUND_STATUSES.includes(refund.status) &&
    refund.failureReason !== RefundFailureReason.canceled;

/**
 * Refusals that end the retrying: the provider (or the lack of one) gave a definite answer about
 * THIS refund, and asking again will not change it. They show on the attention list at once and
 * are never sent again; the shop pays back another way.
 */
export const FINAL_REFUND_FAILURES: readonly RefundFailureReason[] = [
    RefundFailureReason.declined,
    RefundFailureReason.expired_or_canceled_card,
    RefundFailureReason.lost_or_stolen_card,
    RefundFailureReason.provider_removed
];

/**
 * Refusals after which the money provably did not move, so an operator may report it returned by
 * hand. Not the same set as {@link FINAL_REFUND_FAILURES}: `insufficient_funds` is still retried
 * (the shop may top up its provider balance) yet nothing went out. The unclear `provider_unavailable`
 * and `unknown` are absent on purpose: the refund may have gone through.
 */
export const MONEY_DID_NOT_MOVE_FAILURES: readonly RefundFailureReason[] = [
    ...FINAL_REFUND_FAILURES,
    RefundFailureReason.insufficient_funds
];

/**
 * Whether an operator may report this refund's money returned outside the application. A hand-paid
 * refund: any `pending` one (nobody else can say the cash went back). A card refund: only one the
 * provider refused in a way that proves the money did not move, because a settle on an unclear
 * failure could pay the buyer twice.
 *
 * @param payment - the payment the refund sits on
 * @param refund - the refund record
 */
export const mayBeSettledByHand = (
    payment: { provider: string },
    refund: { status: RefundStatus; failureReason?: RefundFailureReason }
): boolean =>
    isHandRecorded(payment)
        ? refund.status === RefundStatus.pending
        : refund.status === RefundStatus.failed &&
          refund.failureReason !== undefined &&
          MONEY_DID_NOT_MOVE_FAILURES.includes(refund.failureReason);

/**
 * Whether staff may void this refund: the same refunds an operator may report returned by hand,
 * because both rest on one fact, that the money provably did not move. A `succeeded` refund
 * moved it; a `pending` card refund or an unclear failure may have.
 *
 * @param payment - the payment the refund sits on
 * @param refund - the refund record
 */
export const mayBeCanceled = (
    payment: { provider: string },
    refund: { status: RefundStatus; failureReason?: RefundFailureReason }
): boolean => mayBeSettledByHand(payment, refund);

/** The longest wait the growing retry delay reaches: a day. */
const MAX_RETRY_DELAY_MS = 24 * 60 * 60_000;

/**
 * When a refund the provider just refused may be sent again: the base wait doubling with every
 * refusal, capped at a day. `undefined` for a final refusal, which is never sent again.
 *
 * @param failureReason - the closed code for the refusal
 * @param attempts - how many refusals the record has now, this one included
 * @param baseMinutes - the first wait, in minutes
 * @param now - the instant of the refusal
 */
export const nextRefundAttemptAt = (
    failureReason: RefundFailureReason,
    attempts: number,
    baseMinutes: number,
    now: Date
): Date | undefined =>
    FINAL_REFUND_FAILURES.includes(failureReason)
        ? undefined
        : new Date(
              now.getTime() +
                  Math.min(
                      baseMinutes * 60_000 * 2 ** Math.max(attempts - 1, 0),
                      MAX_RETRY_DELAY_MS
                  )
          );
