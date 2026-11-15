/**
 * @module
 * The two figures the daily staff digest reads off the returns: requests nobody has decided, and
 * approved returns long overdue for their goods. Counts only.
 *
 * @see docs/modules/shop-tasks.md#the-staff-digest
 */

import { ReturnKind, ReturnReason, ReturnStatus } from '@types';
import { DAY_MS } from '@domain-primitives/time';
import { returnRepository } from '../repository';

/** What the digest counts on the returns side. */
export interface ReturnsDigest {
    /** Requests still waiting for a decision after the allowance. */
    undecided: number;
    /** Approved returns past the buyer's days to send, with neither goods nor proof of sending. */
    returnsAwaitingGoods: number;
}

/** The allowances the digest counts against. */
export interface ReturnsDigestAllowances {
    /** A request counts after waiting this many days. */
    decisionDays: number;
    /** An approved return counts once this many days have passed with no goods and no proof. */
    sendBackOverdueDays: number;
}

/**
 * Count what the returns owe staff attention to.
 *
 * The overdue clock starts on the day the buyer stated a withdrawal, and on the day staff approved
 * a faulty or wrong item: that is when the buyer's days to send the goods began.
 *
 * @param now - the instant the allowances are measured from
 * @param allowances - the days a request or an approved return may wait
 */
export const returnsDigest = (
    now: Date,
    { decisionDays, sendBackOverdueDays }: ReturnsDigestAllowances
): Promise<ReturnsDigest> => {
    const overdueBefore = new Date(now.getTime() - sendBackOverdueDays * DAY_MS);
    return Promise.all([
        returnRepository.count({
            status: ReturnStatus.requested,
            createdAt: { $lte: new Date(now.getTime() - decisionDays * DAY_MS) }
        }),
        returnRepository.count({
            status: ReturnStatus.approved,
            kind: ReturnKind.return,
            proofOfSendingAt: { $exists: false },
            $or: [
                { reason: ReturnReason.withdrawal, requestedAt: { $lte: overdueBefore } },
                {
                    reason: { $in: [ReturnReason.defective, ReturnReason.wrong_item] },
                    decidedAt: { $lte: overdueBefore }
                }
            ]
        })
    ]).then(([undecided, returnsAwaitingGoods]) => ({ undecided, returnsAwaitingGoods }));
};
