/**
 * @module
 * Ending sessions, in one place. Every "I may be compromised" event moves the account's session
 * epoch (so live ACCESS tokens die too) and removes its refresh tokens. The epoch is the part that
 * matters, so it rides in the credential's own write (or, for logout-all and the email undo, in its
 * own transaction first); the token removal is housekeeping. A password change goes further and
 * purges what an attacker could still redeem.
 *
 * The caller survives by re-minting its own refresh cookie in the same response
 * (`../session/session.ts`) — except logout-all, which signs the caller out as well.
 * See docs/modules/account-sessions.md.
 */

import { userService, TokenType, type UserDocument } from '@modules/users';
import { logger } from '@infrastructure/adapters/logger';
import { announceInTransaction, type OutboxAnnouncement } from '@kernel/outbox';
import { ACCOUNT_SESSIONS_REVOKED, type SessionsRevokedReason } from '../events';
import {
    PASSWORD_RESET_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE
} from './token-types';

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
 * @param user - the account
 * @param reason - why its sessions ended
 */
export const announceSessionsRevoked = (
    user: UserDocument,
    reason: SessionsRevokedReason
): Promise<UserDocument> =>
    announceInTransaction(
        (session) => userService.bumpSessionEpoch(user.id, undefined, session).then(() => user),
        () => sessionsRevokedAnnouncement(user.id, reason)
    );

/**
 * Remove every refresh token. Housekeeping once the epoch has moved: the epoch already refuses
 * them, so a failure here is logged and not turned into an error for a change that has landed.
 *
 * @param user - the account, loaded with its credentials (`tokens`)
 */
export const dropRefreshTokens = (user: UserDocument): Promise<void> =>
    userService.tokenRemoveAll(user, TokenType.REFRESH).catch((error: unknown) => {
        logger.warn({
            message: 'Sessions ended, but removing their refresh tokens failed.',
            userId: user.id,
            error
        });
    });

/**
 * Logout everywhere, or any other wholesale end of sessions that must be announced:
 * {@link announceSessionsRevoked}, then {@link dropRefreshTokens}.
 *
 * @param user - the account, loaded with its credentials (`tokens`)
 * @param reason - why its sessions ended
 */
export const revokeAllSessionsAnnounced = (
    user: UserDocument,
    reason: SessionsRevokedReason
): Promise<void> => announceSessionsRevoked(user, reason).then(() => dropRefreshTokens(user));

/**
 * The one-time token types a password change must kill, listed by name rather than "everything but
 * refresh": a type added later (the email-change undo link) must opt IN to being purged, and the
 * undo token deliberately never does.
 */
const PENDING_TOKEN_TYPES: readonly string[] = [
    PASSWORD_RESET_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    TokenType.MFA_CHALLENGE
];

/**
 * What a changed or reset password purges once the epoch has already moved (in the password's own
 * write): every refresh token, every pending one-time token and every live MFA challenge — a link
 * mailed before the change must not outlive the password it was issued under.
 *
 * @param user - the account, loaded with its credentials (`tokens`)
 */
export const purgeAfterPasswordChange = (user: UserDocument): Promise<void> =>
    Promise.all(
        [TokenType.REFRESH, ...PENDING_TOKEN_TYPES].map((type) =>
            userService.tokenRemoveAll(user, type)
        )
    ).then(() => undefined);
