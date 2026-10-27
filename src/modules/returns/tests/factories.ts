/**
 * @module
 * Return fixtures for tests outside this module. A bare row, written past the service, for a test
 * that counts returns by status and age and needs none of their lines or money.
 */

import { returnModel } from '../model';

/** The few fields a count by status and age reads. */
export interface BareReturn {
    status: 'requested' | 'approved';
    reason: string;
    /** How long ago it was opened. */
    daysAgo: number;
}

/**
 * Insert returns that carry only what a count reads. Bypasses validation on purpose: the lines,
 * the order and the money are not under test.
 *
 * @param rows - the returns to write
 */
export const insertBareReturns = (rows: readonly BareReturn[]): Promise<unknown> =>
    returnModel.collection.insertMany(
        rows.map(({ status, reason, daysAgo }) => ({
            status,
            kind: 'return',
            reason,
            createdAt: new Date(Date.now() - daysAgo * 86_400_000)
        }))
    );
