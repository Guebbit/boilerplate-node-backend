/**
 * @module
 * The inactivity reaper's own reads, one per stage.
 */

import { levelsOfMany } from '@modules/access';
import { logger } from '@infrastructure/adapters/logger';
import { userRepository } from '../repository';
import { personalDataMinimisers } from '../erasure-registry';
import type { UserDocument } from '../model';

/**
 * Keeps only the accounts the reaper may take offline: people at the `user` level. An employee's
 * account ends when the employment does, decided by a person — never by a quiet month — and the
 * shop's only administrator is exactly who a long holiday would otherwise erase.
 *
 * @param accounts - the reaper's candidates for one stage
 */
const customersOnly = (accounts: UserDocument[]): Promise<UserDocument[]> =>
    levelsOfMany(accounts.map((account) => String(account._id))).then((levels) =>
        accounts.filter((account) => levels.get(String(account._id)) === 'user')
    );

/**
 * Every account inactive past the warning threshold, never yet warned —
 * `reap:inactive-accounts`'s first stage. Staff and administrators are never in it.
 */
export const findInactiveUnwarned = (cutoff: Date) =>
    userRepository.findInactiveUnwarned(cutoff).then(customersOnly);

/**
 * Every account warned before `warnedBefore` and not active since — the reaper's soft-delete
 * stage. Staff and administrators are never in it.
 */
export const findWarnedStillInactive = (warnedBefore: Date) =>
    userRepository.findWarnedStillInactive(warnedBefore).then(customersOnly);

/**
 * Every account soft-deleted by the reaper past ITS OWN grace window — the hard-delete stage.
 * Staff and administrators are never in it.
 */
export const findReaperSoftDeletedPastGrace = (cutoff: Date) =>
    userRepository.findReaperSoftDeletedPastGrace(cutoff).then(customersOnly);

/**
 * Every account quiet since before `cutoff` and not yet minimised for this stretch of inactivity —
 * the reaper's minimise stage. Staff and administrators are never in it.
 */
export const findInactiveUnminimised = (cutoff: Date) =>
    userRepository.findInactiveUnminimised(cutoff).then(customersOnly);

/**
 * Run every module's `personalData.minimise` hook for one account, then stamp it minimised. The
 * stamp comes only after every hook succeeded, so a failed account is found again next run.
 *
 * @param user - an account from {@link findInactiveUnminimised}
 */
export const minimiseInactive = async (user: UserDocument): Promise<void> => {
    for (const minimise of personalDataMinimisers()) await minimise(user.id);
    await userRepository.markInactivityMinimised(user.id, new Date());
};

/**
 * The minimise stage as a whole: every candidate minimised, one failure never stopping the rest.
 *
 * @param cutoff - last activity must be older than this
 * @returns how many accounts were minimised and how many failed (retried on the next run)
 */
export const minimiseInactiveBefore = (
    cutoff: Date
): Promise<{ minimised: number; failed: number }> =>
    findInactiveUnminimised(cutoff).then(async (candidates) => {
        let failed = 0;
        for (const user of candidates)
            await minimiseInactive(user).catch((error: unknown) => {
                failed += 1;
                logger.error({
                    message: 'Minimising an inactive account failed; it is retried next run.',
                    userId: user.id,
                    error
                });
            });
        return { minimised: candidates.length - failed, failed };
    });
