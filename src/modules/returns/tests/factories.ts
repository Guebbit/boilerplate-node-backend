/**
 * @module
 * Return fixtures for tests outside this module. A bare row, written past the service, for a test
 * that counts returns by status and age and needs none of their lines or money.
 */

import { returnModel } from '../model';
import { DAY_MS } from '@domain-primitives/time';

/** The few fields a count by status and age reads. */
export interface BareReturn {
    status: 'requested' | 'approved';
    reason: string;
    /** How long ago it was opened. */
    daysAgo: number;
    /** A proof of sending is recorded on it. */
    proof?: true;
}

/**
 * Insert returns that carry only what a count reads. Bypasses validation on purpose: the lines,
 * the order and the money are not under test.
 *
 * @param rows - the returns to write
 */
export const insertBareReturns = (rows: readonly BareReturn[]): Promise<unknown> =>
    returnModel.collection.insertMany(
        rows.map(({ status, reason, daysAgo, proof }) => {
            const opened = new Date(Date.now() - daysAgo * DAY_MS);
            return {
                status,
                kind: 'return',
                reason,
                createdAt: opened,
                requestedAt: opened,
                decidedAt: opened,
                ...(proof ? { proofOfSendingAt: opened } : {})
            };
        })
    );
