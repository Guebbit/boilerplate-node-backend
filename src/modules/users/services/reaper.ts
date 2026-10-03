/**
 * @module
 * The inactivity reaper's own reads, one per stage.
 */

import { levelsOfMany } from '@modules/access';
import { userRepository } from '../repository';
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
 * `scripts/ops/reap-inactive-accounts.ts`'s first stage. Staff and administrators are never in it.
 */
export const findInactiveUnwarned = (cutoff: Date) =>
    userRepository.findInactiveUnwarned(cutoff).then(customersOnly);

/**
 * Every account warned, and still inactive past the grace window — the reaper's soft-delete
 * stage. Staff and administrators are never in it.
 */
export const findWarnedStillInactive = (cutoff: Date) =>
    userRepository.findWarnedStillInactive(cutoff).then(customersOnly);

/**
 * Every account soft-deleted by the reaper past ITS OWN grace window — the hard-delete stage.
 * Staff and administrators are never in it.
 */
export const findReaperSoftDeletedPastGrace = (cutoff: Date) =>
    userRepository.findReaperSoftDeletedPastGrace(cutoff).then(customersOnly);
