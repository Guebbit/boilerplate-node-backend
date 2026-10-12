/**
 * @module
 * Ending sessions, in one place. Every "I may be compromised" event moves the account's session
 * epoch (so live ACCESS tokens die too) and deletes its session rows. The epoch is the part that
 * matters, so it rides in the credential's own write (or, for logout-all and the email undo, in its
 * own transaction first); the row deletion is housekeeping. A password change goes further and
 * purges what an attacker could still redeem.
 *
 * The caller survives by re-minting its own session in the same response
 * (`../session/session.ts`) — except logout-all, which signs the caller out as well.
 * See docs/modules/account-sessions.md.
 */

import { userService } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import { announceInTransaction, type OutboxAnnouncement } from '@kernel/outbox';
import { ACCOUNT_SESSIONS_REVOKED, type SessionsRevokedReason } from '../events';
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
 * Move the epoch and write the `account.sessions-revoked` row in ONE transaction, so subscribers
 * hear of it exactly when the sessions died, and a failing subscriber is retried by the relay
 * rather than skipped.
 *
 * @param userId - the account
 * @param reason - why its sessions ended
 */
export const announceSessionsRevoked = (
    userId: string,
    reason: SessionsRevokedReason
): Promise<void> =>
    announceInTransaction(
        // Hands back the id: a `write` that resolves to nothing announces nothing.
        (session) => userService.bumpSessionEpoch(userId, undefined, session).then(() => userId),
        (id) => sessionsRevokedAnnouncement(id, reason)
    ).then(() => undefined);

/**
 * Delete every session row. Housekeeping once the epoch has moved: the epoch already refuses
 * them, so a failure here is logged and not turned into an error for a change that has landed.
 *
 * @param userId - the account
 */
export const dropSessions = (userId: string): Promise<void> =>
    sessionRepository
        .removeAll(userId)
        .then(() => undefined)
        .catch((error: unknown) => {
            logger.warn({
                message: 'Sessions ended, but deleting their rows failed.',
                userId,
                error
            });
        });

/**
 * Logout everywhere, or any other wholesale end of sessions that must be announced:
 * {@link announceSessionsRevoked}, then {@link dropSessions}.
 *
 * @param userId - the account
 * @param reason - why its sessions ended
 */
export const revokeAllSessionsAnnounced = (
    userId: string,
    reason: SessionsRevokedReason
): Promise<void> => announceSessionsRevoked(userId, reason).then(() => dropSessions(userId));

/**
 * The one-time token kinds a password change must kill, listed by name rather than "everything":
 * a kind added later (the email-change undo link) must opt IN to being purged, and the undo token
 * deliberately never does.
 */
const PENDING_TOKEN_TYPES: readonly VerificationTokenType[] = [
    PASSWORD_RESET_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    MFA_CHALLENGE_TOKEN_TYPE
];

/**
 * What a changed or reset password purges once the epoch has already moved (in the password's own
 * write): every session, every pending one-time token and every live MFA challenge — a link
 * mailed before the change must not outlive the password it was issued under.
 *
 * @param userId - the account
 */
export const purgeAfterPasswordChange = (userId: string): Promise<void> =>
    Promise.all([
        sessionRepository.removeAll(userId),
        removeTokens(userId, PENDING_TOKEN_TYPES)
    ]).then(() => undefined);
