/**
 * @module
 * The inactivity reaper's own reads, one per stage.
 */

import { userRepository } from '../repository';

/**
 * Every account inactive past the warning threshold, never yet warned —
 * `scripts/ops/reap-inactive-accounts.ts`'s first stage.
 */
export const findInactiveUnwarned = (cutoff: Date) => userRepository.findInactiveUnwarned(cutoff);

/**
 * Every account warned, and still inactive past the grace window — the reaper's soft-delete
 * stage.
 */
export const findWarnedStillInactive = (cutoff: Date) =>
    userRepository.findWarnedStillInactive(cutoff);

/** Every account soft-deleted by the reaper past ITS OWN grace window — the hard-delete stage. */
export const findReaperSoftDeletedPastGrace = (cutoff: Date) =>
    userRepository.findReaperSoftDeletedPastGrace(cutoff);
