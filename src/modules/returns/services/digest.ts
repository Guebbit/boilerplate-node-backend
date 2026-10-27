/**
 * @module
 * The two figures the daily staff digest reads off the returns: requests nobody has decided, and
 * withdrawals whose goods are still expected. Counts only.
 *
 * See: docs/modules/notifications.md#the-daily-digest
 */

import { ReturnKind, ReturnReason, ReturnStatus } from '@types';
import { DAY_MS } from '@domain-primitives/time';
import { returnRepository } from '../repository';

/** What the digest counts on the returns side. */
export interface ReturnsDigest {
    /** Requests still waiting for a decision after the allowance. */
    undecided: number;
    /** Approved withdrawals whose goods have not been received. */
    withdrawalsAwaitingGoods: number;
}

/**
 * Count what the returns owe staff attention to.
 *
 * @param now - the instant the allowance is measured from
 * @param decisionDays - a request counts after waiting this many days
 */
export const returnsDigest = (now: Date, decisionDays: number): Promise<ReturnsDigest> =>
    Promise.all([
        returnRepository.count({
            status: ReturnStatus.requested,
            createdAt: { $lte: new Date(now.getTime() - decisionDays * DAY_MS) }
        }),
        returnRepository.count({
            status: ReturnStatus.approved,
            kind: ReturnKind.return,
            reason: ReturnReason.withdrawal
        })
    ]).then(([undecided, withdrawalsAwaitingGoods]) => ({ undecided, withdrawalsAwaitingGoods }));
