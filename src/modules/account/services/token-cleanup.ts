/**
 * @module
 * The whole-collection sweeps run by the nightly `reap:expired-tokens` job: the `tokens` array, and
 * the previous email once its undo link is gone.
 * A login and a refresh prune only THEIR OWN account's entries (`../session/prune.ts`).
 *
 * Why not on every request: the whole-collection `updateMany` is an unindexed scan (`$elemMatch` on
 * `tokens`), and running it on every login and every refresh let anonymous traffic schedule it.
 * Nothing needs it promptly: an expired entry is already refused wherever it is read.
 */

import { userService } from '@modules/users';
import { getReuseDetectionWindowMilliseconds } from '../session/config';
import { EMAIL_CHANGE_UNDO_TOKEN_TYPE } from './token-types';

/**
 * Remove every expired token, plus every rotated-away one older than the REUSE-DETECTION window,
 * from every account. Only the nightly reaper calls it.
 *
 * That window, not the rotation grace window: purging on the grace window would delete a
 * superseded entry before `rotateRefreshToken` could recognise a later replay as reuse — the
 * tombstone has to survive at least as long as reuse detection is willing to look for it.
 *
 * @returns how many account documents were pruned
 */
export const reapExpiredTokens = (): Promise<number> =>
    userService.tokenRemoveExpired(getReuseDetectionWindowMilliseconds());

/**
 * End the `changed` state of every account whose 7-day undo link has lapsed: forget the previous
 * address it was kept for (the `lapse` edge in `../domain/email-change.ts`). Data minimisation —
 * an old address has no use once nothing can restore it.
 *
 * @returns how many accounts were cleared
 */
export const reapLapsedPreviousEmails = (): Promise<number> =>
    userService.clearLapsedPreviousEmail(EMAIL_CHANGE_UNDO_TOKEN_TYPE);
