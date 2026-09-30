/**
 * @module
 * Token writes: append, spend, supersede, touch and sweep, one named door each.
 */

import type { Token, UserDocument } from '../model';
import { hashToken } from '../model';
import { userRepository } from '../repository';

/**
 * Remove the given token from the user document and persist it — used to consume a one-time
 * password-reset token after the reset completes. An atomic `$pull`, not read-modify-write:
 * `POST /account/reset-confirm` saves the document twice (password, then this), so two
 * simultaneous confirms of one token both loaded version V and a read-modify-write would raise a
 * `VersionError` (500) on a request that had, in fact, already worked. `$pull` at write time
 * makes a second consume a no-op instead.
 *
 * @param user - the loaded document, kept in step with the write for callers that read it back
 * @param token - the token value to spend
 */
export const consumeToken = (user: UserDocument, token: string): Promise<boolean> =>
    userRepository.tokenRemove(user.id, token).then(({ modifiedCount }) => {
        // `tokens[].token` is hashed at rest — hash `token` the same way to resync
        // the loaded document's local copy after the DB `$pull`.
        const digest = hashToken(token);
        user.tokens = user.tokens.filter((tk) => tk.token !== digest);
        // `true` only for the caller whose write actually removed it. Two simultaneous uses of one
        // reset link both pass the earlier "does this token exist" read, so this is the only
        // point at which they can be told apart — see `postResetConfirm`.
        return modifiedCount > 0;
    });

/**
 * Append a token (reset, delete-confirmation, or the JWT layer's own refresh rotation) — the
 * named door onto `UserMethods.tokenAdd`, so `account` (the one sibling allowed to hold a
 * hydrated `UserDocument` at all, per the shared-kernel note above) writes through this module
 * instead of calling the document's own instance method directly. `$push`s, never rebuilds the
 * array — see the method's own doc for why that matters under a concurrent request.
 */
export const tokenAdd = (
    user: UserDocument,
    type: Token['type'],
    expirationMs: number,
    token: string,
    amr?: string[]
): Promise<string> => user.tokenAdd(type, expirationMs, token, amr);

/** Spend every token of one type at once — "log out everywhere" for that token type. Same reasoning as {@link tokenAdd}. */
export const tokenRemoveAll = (user: UserDocument, type: Token['type']): Promise<void> =>
    user.tokenRemoveAll(type);

/** Revoke one refresh token by its subdocument id — "log out that device", not every device. */
export const sessionRemove = (id: string, sessionId: string) =>
    userRepository.sessionRemove(id, sessionId);

/** Spend a refresh token by value alone, no user id in the filter — the single-session logout. */
export const tokenRemoveByValue = (token: string) => userRepository.tokenRemoveByValue(token);

/** Sweep every token past its reuse-detection retention window. */
export const tokenRemoveExpired = (supersededRetentionMs: number) =>
    userRepository.tokenRemoveExpired(supersededRetentionMs);

/** Mark a refresh token superseded — the one-time-use half of rotation. */
export const tokenSupersede = (token: string) => userRepository.tokenSupersede(token);

/** Bump a refresh token's last-used stamp, without touching anything else on the document. */
export const tokenTouch = (token: string) => userRepository.tokenTouch(token);
