/**
 * @module
 * The nightly `reap:previous-emails` sweep: forget the previous address of every account whose
 * undo link is gone. Expired sessions and one-time tokens need no sweep — each row carries its own
 * TTL date and the database deletes it.
 */

import { userService } from '@modules/users';
import { verificationTokenRepository } from '../repository';
import { EMAIL_CHANGE_UNDO_TOKEN_TYPE } from '../token-types';

/**
 * End the `changed` state of every account whose 7-day undo link has lapsed: forget the previous
 * address it was kept for (the `lapse` edge in `../domain/email-change.ts`). Data minimisation —
 * an old address has no use once nothing can restore it.
 *
 * "Lapsed" is the link's own state: no live undo token. One that expired, was spent, or was
 * revoked all read alike.
 *
 * @returns how many accounts were cleared
 */
export const reapLapsedPreviousEmails = (): Promise<number> =>
    verificationTokenRepository
        .userIdsWithLive(EMAIL_CHANGE_UNDO_TOKEN_TYPE, new Date())
        .then((keep) => userService.clearLapsedPreviousEmail(keep));
