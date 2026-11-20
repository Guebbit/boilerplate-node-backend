/**
 * @module
 * What a dispute ending leaves owed. A refund the bank's dispute refused (`disputed`) waited for
 * the dispute to be decided; once none is open, the money is owed another way and staff must be
 * told, with the outcome that says how. A refund staff marked returned because the bank kept the
 * money is owed again if the dispute is then won. Pure: the write step reads the payment and
 * announces.
 *
 * @see docs/modules/payments.md#disputes
 */

import { RefundFailureReason, RefundStatus } from '@types';
import {
    anyDisputeKeptMoney,
    bankKeptMoney,
    hasOpenDispute,
    otherCurrencyKept,
    type DisputeFacts
} from './disputes';
import { isReversed } from './lifecycle';

/** The slice of a refund record the rule reads. */
interface WaitingRefund {
    _id: { toString: () => string };
    amount: string;
    currency: string;
    status: RefundStatus;
    failureReason?: RefundFailureReason | undefined;
    reversedAt?: Date | undefined;
    settledAgainstDispute?: string | undefined;
}

/** A stored dispute with the two fields that name and order it. */
interface StoredDisputeFacts extends DisputeFacts {
    disputeRef: string;
    observedAt: Date;
}

/** A payment as far as the end of a dispute sees it. */
interface PaymentAtDisputeEnd {
    currency: string;
    disputes?: readonly DisputeFacts[] | undefined;
    refunds: readonly WaitingRefund[];
}

/** One refund owed again, with what the dispute's outcome says about it. */
export interface RefundOwedAfterDispute {
    refundId: string;
    amount: string;
    currency: string;
    /** `true` when the bank took the refund back after it had settled. */
    reversed: boolean;
    /** `true` when ANY dispute on the payment kept money: the buyer already has it, so staff only mark it returned. */
    bankKept: boolean;
    /** The currency of a kept dispute in another currency than the payment's, if there is one. */
    otherCurrency?: string;
    /** `true` when the refund had already been marked returned: the win makes it owed again. */
    markedReturned?: true;
    /** `true` when a lost dispute flipped to won, for the wording. */
    followsFlip?: true;
}

/**
 * The refunds a dispute's end hands back to staff: the ones still open and refused as `disputed`,
 * and only once no dispute on the payment is open (a second dispute still decides where the money
 * goes). A refund settled or voided meanwhile is not owed. The outcome is read over EVERY dispute
 * on the payment, not the one that just ended: a refund held back for one dispute is already paid
 * if the bank kept money in another, and the app cannot tell which one held it.
 *
 * @param payment - the payment AFTER the dispute's write, read in the writing transaction
 * @returns one entry per refund owed again, in the payment's order; empty when none is
 */
export const refundsOwedAfterDispute = (payment: PaymentAtDisputeEnd): RefundOwedAfterDispute[] => {
    if (hasOpenDispute(payment)) return [];
    const otherCurrency = otherCurrencyKept(payment, payment.currency);
    return payment.refunds
        .filter(
            (refund) =>
                refund.status === RefundStatus.failed &&
                refund.failureReason === RefundFailureReason.disputed
        )
        .map((refund) => ({
            refundId: refund._id.toString(),
            amount: refund.amount,
            currency: refund.currency,
            reversed: isReversed(refund),
            bankKept: anyDisputeKeptMoney(payment),
            ...(otherCurrency ? { otherCurrency } : {})
        }));
};

/**
 * The dispute a refund marked returned now was settled against: the latest one the bank kept money
 * in. Marked returned after a win, or with no dispute on file, it was settled against none.
 *
 * @param payment - the payment the refund sits on
 * @param refund - the refund being marked returned
 * @returns the provider's dispute id, or `undefined` when no dispute is behind it
 */
export const disputeBehindRefund = (
    payment: { disputes?: readonly StoredDisputeFacts[] | undefined },
    refund: Pick<WaitingRefund, 'failureReason'>
): string | undefined => {
    if (refund.failureReason !== RefundFailureReason.disputed) return undefined;
    const kept = (payment.disputes ?? []).filter((dispute) => bankKeptMoney(dispute));
    return kept.toSorted((a, b) => b.observedAt.getTime() - a.observedAt.getTime())[0]?.disputeRef;
};

/**
 * The refunds a win makes owed again: a dispute the bank kept money in flips to won, taking the
 * money back from the buyer, and staff had marked the refund returned because the buyer "already
 * had it". Matched by the dispute id on the refund, so a second dispute's refunds are untouched.
 *
 * @param payment - the payment AFTER the write, read in the writing transaction
 * @param previous - the dispute as stored before the write
 * @param ended - the dispute as now stored
 * @param disputeId - the provider's dispute id
 * @returns one entry per refund owed again; empty unless the bank had kept the money and no longer does
 */
export const refundsOwedAfterWin = (
    payment: PaymentAtDisputeEnd,
    previous: DisputeFacts,
    ended: DisputeFacts,
    disputeId: string
): RefundOwedAfterDispute[] =>
    bankKeptMoney(previous) && !bankKeptMoney(ended)
        ? payment.refunds
              .filter(
                  (refund) =>
                      refund.status === RefundStatus.succeeded &&
                      refund.settledAgainstDispute === disputeId
              )
              .map((refund) => ({
                  refundId: refund._id.toString(),
                  amount: refund.amount,
                  currency: refund.currency,
                  reversed: true,
                  bankKept: false,
                  markedReturned: true as const
              }))
        : [];
