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

import { addMoney, subtractMoney, toMinorUnits, type Money } from '@domain-primitives/money';
import { RefundFailureReason, RefundStatus, type PaymentStatus } from '@types';
import { hasDecidedDispute, lostChargebackCovers, type DisputablePayment } from './disputes';

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
    RefundFailureReason.provider_removed,
    // A chargeback: the bank already took the money back. Final, but never settled by hand.
    RefundFailureReason.disputed
];

/**
 * Refusals that say nothing about THIS refund: the provider did not answer, or the adapter could
 * not classify the answer. The refund may have gone through, so the money is never assumed unmoved.
 */
export const UNCLEAR_REFUND_FAILURES: readonly RefundFailureReason[] = [
    RefundFailureReason.provider_unavailable,
    RefundFailureReason.unknown
];

/**
 * Whether a refusal ends the retrying (see {@link FINAL_REFUND_FAILURES}).
 * @param reason - the closed code for the refusal
 */
export const isFinalFailure = (reason: RefundFailureReason): boolean =>
    FINAL_REFUND_FAILURES.includes(reason);

/**
 * Refusals after which the money provably did not move, so an operator may report it returned by
 * hand. Not the same set as {@link FINAL_REFUND_FAILURES}: `insufficient_funds` is still retried
 * (the shop may top up its provider balance) yet nothing went out. The unclear `provider_unavailable`
 * and `unknown` are absent on purpose: the refund may have gone through.
 */
export const MONEY_DID_NOT_MOVE_FAILURES: readonly RefundFailureReason[] = [
    ...FINAL_REFUND_FAILURES.filter((reason) => reason !== RefundFailureReason.disputed),
    RefundFailureReason.insufficient_funds
];

/**
 * Whether the buyer is owed this money another way and has to be asked how: the record is still
 * open and either the provider took it back, or it was refused for good. A refusal that says
 * nothing about the buyer's card (the shop's own balance, no answer yet) and a chargeback (the bank
 * already returned the money) do not count.
 *
 * @param refund - the refund record
 */
export const owesBuyerAnotherWay = (refund: {
    status: RefundStatus;
    failureReason?: RefundFailureReason | undefined;
    reversedAt?: Date | undefined;
}): boolean =>
    isOpenRefund(refund) &&
    refund.failureReason !== RefundFailureReason.disputed &&
    (isReversed(refund) ||
        (refund.failureReason !== undefined &&
            FINAL_REFUND_FAILURES.includes(refund.failureReason)));

/** The slice of a refund record the rules below read. */
export interface RefundFacts {
    /** The record's id, to tell it from its siblings. */
    _id?: { toString: () => string };
    status: RefundStatus;
    amount: number;
    currency: string;
    failureReason?: RefundFailureReason | undefined;
    /** Set once when the provider took back a refund it had settled; never cleared. */
    reversedAt?: Date | undefined;
    /** The provider's id for the refund: present once the provider has accepted it. */
    providerRefundRef?: string | undefined;
}

/** The slice of a payment the refund rules read. */
export interface RefundablePayment extends DisputablePayment {
    provider: string;
    amount: number;
    currency: string;
    refunds: readonly RefundFacts[];
}

/**
 * Whether the provider took this refund back after settling it (the bank sent it back): the money
 * is with the shop again and is owed another way.
 * @param refund - the refund record
 */
export const isReversed = (refund: { reversedAt?: Date | undefined }): boolean =>
    refund.reversedAt !== undefined;

/**
 * Whether two facts name the same record: the same object, or the same id.
 * @param a - one record
 * @param b - the other
 */
const sameRecord = (a: RefundFacts, b: RefundFacts): boolean =>
    a === b || (a._id !== undefined && b._id !== undefined && String(a._id) === String(b._id));

/**
 * Whether the provider holds this record's money: it settled, or it holds a provider refund id. A
 * record whose last refusal was unclear is NOT counted: if it had gone through, the provider's list
 * would carry it under our record id and it would have settled. A reversed record is the opposite:
 * the money came back.
 * @param refund - the refund record
 */
const mayHaveMoved = (refund: RefundFacts): boolean =>
    !isReversed(refund) &&
    (refund.status === RefundStatus.succeeded || refund.providerRefundRef !== undefined);

/**
 * By how much (minor units) an unsent open refund overshoots what the provider can still give back.
 * @param payment - the payment the refund sits on
 * @param refund - the refund record
 */
export const exceedsBy = (payment: RefundablePayment, refund: RefundFacts): Money =>
    subtractMoney(
        addMoney(
            ...payment.refunds
                .filter((other) => !sameRecord(other, refund) && mayHaveMoved(other))
                .map((other) => toMinorUnits(other.amount, other.currency)),
            toMinorUnits(refund.amount, refund.currency)
        ),
        toMinorUnits(payment.amount, payment.currency)
    );

/**
 * Whether an open refund the application never sent no longer fits: what the provider already holds
 * (settled or in flight, an outside refund imported included) plus this record is more than was
 * paid. Such a record is held unsent: the provider would refuse it, and staff decide.
 *
 * @param payment - the payment the refund sits on
 * @param refund - the refund record, by identity within `payment.refunds`
 */
export const exceedsRemaining = (payment: RefundablePayment, refund: RefundFacts): boolean =>
    isOpenRefund(refund) && !mayHaveMoved(refund) && exceedsBy(payment, refund) > 0;

/**
 * Whether an operator may report this refund's money returned outside the application. A hand-paid
 * refund: any `pending` one (nobody else can say the cash went back). A card refund: one the
 * provider refused in a way that proves the money did not move, one it took back after settling it
 * (the bank sent it back), or one held unsent because it no longer fits the payment. Never an
 * unclear failure, because a settle on it could pay the buyer twice. A refund refused as `disputed`
 * only once a lost chargeback covers its amount (the bank paid the buyer).
 *
 * @param payment - the payment the refund sits on
 * @param refund - the refund record
 */
export const mayBeSettledByHand = (payment: RefundablePayment, refund: RefundFacts): boolean => {
    if (isHandRecorded(payment)) return refund.status === RefundStatus.pending;
    // A refund refused as disputed is the bank's to settle: once a lost chargeback covers it, the
    // bank paid the buyer, so it is reported returned. Until then (or if the shop won) it is not.
    if (refund.failureReason === RefundFailureReason.disputed)
        return lostChargebackCovers(payment, refund.amount, refund.currency);
    if (exceedsRemaining(payment, refund)) return true;
    // The provider itself reported the failure: a definite answer about this very refund.
    if (isReversed(refund)) return refund.status === RefundStatus.failed;
    return (
        refund.status === RefundStatus.failed &&
        refund.failureReason !== undefined &&
        MONEY_DID_NOT_MOVE_FAILURES.includes(refund.failureReason)
    );
};

/**
 * Whether staff may void this refund: the refunds an operator may report returned by hand, because
 * both rest on one fact, that the money provably did not move. A reversed refund is the exception:
 * it settled once and has its credit note, so voiding it would unbalance the books.
 *
 * @param payment - the payment the refund sits on
 * @param refund - the refund record
 */
export const mayBeCanceled = (payment: RefundablePayment, refund: RefundFacts): boolean =>
    !isReversed(refund) &&
    (mayBeSettledByHand(payment, refund) ||
        // A refund refused as `disputed` whose dispute is decided (the shop won) moved no money
        // and is owed no more: staff void it. While a chargeback is open it is left alone.
        (refund.failureReason === RefundFailureReason.disputed && hasDecidedDispute(payment)));

/** Days the trader has to give the money back after a withdrawal (Directive 2011/83/EU, Art. 13). */
const WITHDRAWAL_REFUND_DAYS = 14;

/**
 * The legal deadline to pay a refund back, when it pays for a withdrawal or a return: its creation
 * plus 14 days. A goodwill or late-payment refund, or the shop's own cancellation of an order, has
 * no such deadline.
 *
 * @param refund - the refund's `createdAt` and the return it pays for, if any
 * @returns the deadline, or `undefined` when the law sets none
 */
export const refundDueBy = (refund: { createdAt: Date; returnId?: string }): Date | undefined =>
    refund.returnId === undefined
        ? undefined
        : new Date(refund.createdAt.getTime() + WITHDRAWAL_REFUND_DAYS * 24 * 60 * 60_000);

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
