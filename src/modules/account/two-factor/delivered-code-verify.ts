/**
 * @module
 * Verifying a mailed code against the account, without a read-modify-write: the comparison is
 * pure ({@link checkDeliveredCode}), the spend and the miss count are conditional writes behind
 * the users door. The same path serves a second factor's code and the step-up code.
 */

import { userService, type DeliveredCodeSlot, type UserDocument } from '@modules/users';
import type { DeliveredCodeState } from '@modules/users';
import { DELIVERED_CODE_MAX_ATTEMPTS, checkDeliveredCode } from './delivered-codes';

/**
 * Check `code` against the code in flight in `slot`, and write what the answer costs: a match
 * spends the code, a miss counts an attempt. A parallel request holding the same code loses the
 * spend, so a code works once.
 *
 * @param user - the account, carrying its credential fields
 * @param slot - where the code in flight is stored
 * @param state - that slot as loaded on `user`
 * @param code - the digits the caller typed
 * @param now - the clock, injectable for tests
 * @returns whether THIS call spent the code
 */
export const verifyDeliveredCode = (
    user: UserDocument,
    slot: DeliveredCodeSlot,
    state: DeliveredCodeState | undefined,
    code: string,
    now: Date = new Date()
): Promise<boolean> => {
    const hash = state?.codeHash;
    if (!state || !hash) return Promise.resolve(false);

    const verdict = checkDeliveredCode(state, code, now);
    if (verdict === 'match')
        return userService.spendDeliveredCode(user, slot, hash, DELIVERED_CODE_MAX_ATTEMPTS, now);
    if (verdict === 'miss')
        return userService
            .recordDeliveredMiss(user, slot, hash, DELIVERED_CODE_MAX_ATTEMPTS)
            .then(() => false);
    return Promise.resolve(false);
};
