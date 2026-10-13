/**
 * @module
 * Ending sessions, in one place: {@link revokeFor} acts on a cause from the `REVOCATION` table
 * (`../domain/revocation.ts`), which says what each cause moves, purges and announces.
 *
 * The epoch is the part that matters (it kills live ACCESS tokens too). A cause either rides it in
 * the credential's own write, or {@link revokeFor} moves it in its own transaction. The row and
 * link deletion that follows is housekeeping.
 *
 * See docs/modules/account-sessions.md#revocation.
 */

import { userService } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import { announceInTransaction, type OutboxAnnouncement } from '@kernel/outbox';
import { ACCOUNT_SESSIONS_REVOKED } from '../events';
import {
    REVOCATION,
    announces,
    type RevocationCause,
    type SessionsRevokedReason
} from '../domain/revocation';
import { sessionRepository } from '../repository';
import { removeTokens } from './tokens';
import {
    PASSWORD_RESET_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    MFA_CHALLENGE_TOKEN_TYPE,
    type VerificationTokenType
} from '../token-types';

/**
 * The outbox row that tells subscribers (`api-keys`) an account's sessions were ended wholesale.
 *
 * @param userId - the account
 * @param reason - why its sessions ended
 */
export const sessionsRevokedAnnouncement = (
    userId: string,
    reason: SessionsRevokedReason
): OutboxAnnouncement<typeof ACCOUNT_SESSIONS_REVOKED> => ({
    name: ACCOUNT_SESSIONS_REVOKED,
    payload: { userId, reason },
    aggregateId: userId
});

/**
 * The one-time token kinds a cause with `pending` kills, listed by name rather than "everything":
 * a kind added later must opt IN to being purged, and the email-change undo token deliberately
 * never does (it is already spent by the time its cause runs).
 */
const PENDING_TOKEN_TYPES: readonly VerificationTokenType[] = [
    PASSWORD_RESET_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    MFA_CHALLENGE_TOKEN_TYPE
];

/**
 * Move the epoch, for a cause that owns it. An announcing cause writes the
 * `account.sessions-revoked` row in the SAME transaction, so subscribers hear of it exactly when
 * the sessions died, and a failing subscriber is retried by the relay rather than skipped.
 *
 * @param cause - why sessions end
 * @param userId - the account
 */
const moveEpoch = (cause: RevocationCause, userId: string): Promise<void> => {
    if (REVOCATION[cause].epoch === 'with-write') return Promise.resolve();
    if (!announces(cause)) return userService.bumpSessionEpoch(userId);

    return announceInTransaction(
        // Hands back the id: a `write` that resolves to nothing announces nothing.
        (session) => userService.bumpSessionEpoch(userId, undefined, session).then(() => userId),
        (id) => sessionsRevokedAnnouncement(id, cause)
    ).then(() => undefined);
};

/**
 * Delete the session rows, and the pending links when the cause purges them. Housekeeping once the
 * epoch has moved: it already refuses every old token, so a failure here is logged and not turned
 * into an error for a change that has landed.
 *
 * @param cause - why sessions end
 * @param userId - the account
 */
const settle = (cause: RevocationCause, userId: string): Promise<void> =>
    Promise.all([
        sessionRepository.removeAll(userId),
        REVOCATION[cause].pending ? removeTokens(userId, PENDING_TOKEN_TYPES) : undefined
    ])
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.warn({
                message: 'Sessions ended, but deleting their rows or links failed.',
                userId,
                cause,
                error
            });
        });

/**
 * End the account's sessions for a cause: move the epoch if the cause owns it, then delete the
 * rows and any pending links. A cause that rides the epoch in its own write (`with-write`) calls
 * this AFTER that write, for the rest.
 *
 * @param cause - why sessions end
 * @param userId - the account
 */
export const revokeFor = (cause: RevocationCause, userId: string): Promise<void> =>
    moveEpoch(cause, userId).then(() => settle(cause, userId));
