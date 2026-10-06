/**
 * @module
 * Ending sessions, in one place. Every "I may be compromised" event moves the account's session
 * epoch (so live ACCESS tokens die too) and removes its refresh tokens; a password change goes
 * further and purges what an attacker could still redeem.
 *
 * The caller survives by re-minting its own refresh cookie in the same response
 * (`../session/session.ts`) — except logout-all, which signs the caller out as well.
 * See docs/modules/account-sessions.md.
 */

import { userService, TokenType, type UserDocument } from '@modules/users';
import {
    PASSWORD_RESET_TOKEN_TYPE,
    ACCOUNT_DELETE_TOKEN_TYPE,
    EMAIL_VERIFY_TOKEN_TYPE,
    EMAIL_CHANGE_TOKEN_TYPE
} from './token-types';

/**
 * Move the epoch, then drop every refresh token. The epoch goes FIRST: if the removal fails, the
 * tokens are already dead, which is the direction a failure should lean.
 *
 * @param user - the account, loaded with its credentials (`tokens`)
 */
export const revokeAllSessions = (user: UserDocument): Promise<void> =>
    userService
        .bumpSessionEpoch(user.id)
        .then(() => userService.tokenRemoveAll(user, TokenType.REFRESH));

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
 * What a changed or reset password revokes: every session ({@link revokeAllSessions}), plus every
 * pending one-time token and live MFA challenge — a link mailed before the change must not
 * outlive the password it was issued under.
 *
 * @param user - the account, loaded with its credentials (`tokens`)
 */
export const revokeAfterPasswordChange = (user: UserDocument): Promise<void> =>
    revokeAllSessions(user)
        .then(() =>
            Promise.all(PENDING_TOKEN_TYPES.map((type) => userService.tokenRemoveAll(user, type)))
        )
        .then(() => undefined);
