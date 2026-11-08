/**
 * @module
 * When the refund of a return is legally due, and under which rule. Pure — Directive 2011/83/EU
 * Art. 13 (withdrawal) and Directive 2019/771 Art. 16(3)(b) (a defective or wrong item), read with
 * the Commission's guidance 2021/C 525/01 §5.5.3.
 *
 * The shop may wait for the goods or the buyer's proof of sending, whichever comes first, but
 * waiting never moves the last date: goods or proof that come later make the refund due the moment
 * they do. A buyer who sends nothing and shows no proof leaves the shop holding the refund, with no
 * time limit.
 *
 * See: docs/modules/returns.md#the-refund-deadline
 */

import { isGuaranteeReason } from './reasons';
import type { RefundDueRule, ReturnReason } from '@types';

/** What {@link refundDueByOf} reads off a return. */
export interface RefundDueInput {
    /** Why the goods come back: the rule that sets the date. */
    reason: ReturnReason;
    /**
     * The end of the 14 days after the shop was told (`orders`' `withdrawalRefundDueBy`), worked
     * out by the caller because a domain file reaches no module. Read for a withdrawal only.
     */
    withdrawalDueBy?: Date | undefined;
    /** When the goods arrived. Absent until they do. */
    receivedAt?: Date | undefined;
    /** The date on the carrier's proof of sending. Absent until staff record one. */
    proofOfSendingAt?: Date | undefined;
}

/** The legal deadline of a refund and why: the shape `payments` stamps on the record. */
export interface ReturnRefundDue {
    /** The last moment the refund may be paid without being late. */
    dueBy: Date;
    /** `withdrawal` is the 14-day rule, `faulty` is due when the goods or proof came. */
    dueRule: RefundDueRule;
}

/**
 * The earlier of the instants that are present.
 * @param instants - the moments the goods or their proof showed up
 */
const earliestOf = (...instants: (Date | undefined)[]): Date | undefined =>
    instants
        .filter((instant): instant is Date => instant !== undefined)
        .toSorted((first, second) => first.getTime() - second.getTime())[0];

/** The reasons whose proof of sending opens the refund: for a query as much as for {@link proofOpensRefund}. */
export const PROOF_OPENS_REFUND_FOR: readonly ReturnReason[] = ['withdrawal'];

/**
 * Whether the buyer's proof of sending opens the refund. Only a withdrawal's does: the shop may wait
 * for the goods or the proof, whichever comes first (Directive 2011/83/EU Art. 13(3)). A defective or
 * wrong item may be repaired or replaced instead, and that is decided when the goods are received.
 * @param reason - why the goods come back
 */
export const proofOpensRefund = (reason: ReturnReason): boolean =>
    PROOF_OPENS_REFUND_FOR.includes(reason);

/**
 * Whether the refund of this return was already opened by its proof of sending: a proof is on it
 * and the reason is one a proof opens a refund for. Receiving the goods then neither quotes nor
 * opens a refund again.
 * @param returned - the return's reason and the date of its proof, when one was recorded
 */
export const proofOpenedRefund = (returned: {
    reason: ReturnReason;
    // Only its presence is read, so a wire row's ISO string counts as much as a stored Date.
    proofOfSendingAt?: Date | string | undefined;
}): boolean => returned.proofOfSendingAt !== undefined && proofOpensRefund(returned.reason);

/**
 * The legal deadline of a return's refund, with the rule behind it.
 *
 * | Reason                   | Due                                                              |
 * | ------------------------ | ---------------------------------------------------------------- |
 * | withdrawal               | the later of `withdrawalDueBy` and the goods/proof arriving      |
 * | defective, wrong item    | the moment the goods or the proof of sending arrived             |
 * | anything else (goodwill) | no deadline                                                      |
 *
 * @param input - the return's reason, the withdrawal date and the goods/proof dates it has so far
 * @returns the stamp, or `undefined` when the law sets none (or, for a faulty item, nothing came yet)
 */
export const refundDueByOf = (input: RefundDueInput): ReturnRefundDue | undefined => {
    const arrival = earliestOf(input.receivedAt, input.proofOfSendingAt);
    if (input.reason === 'withdrawal') {
        if (!input.withdrawalDueBy) return undefined;
        return {
            dueBy:
                arrival && arrival.getTime() > input.withdrawalDueBy.getTime()
                    ? arrival
                    : input.withdrawalDueBy,
            dueRule: 'withdrawal'
        };
    }
    return isGuaranteeReason(input.reason) && arrival
        ? { dueBy: arrival, dueRule: 'faulty' }
        : undefined;
};
