/**
 * @module
 * The user's `tokens` array, owned in one place: every non-password flow (reset, verification,
 * delete confirmation, refresh sessions) is an entry in it, and "live" — exists, right type, not
 * expired — is defined once here instead of copied per controller.
 *
 * {@link findLiveToken} and {@link spendLiveToken} stay separate because only the spend's `$pull`
 * is atomic and `post-reset-confirm` must validate the new password before spending; a refusal
 * never says why, so a dead link can't be told apart from an invented one.
 */

import type { Session } from '@types';
import { userRepository, TokenType, type Token, type UserDocument } from '@modules/users';
import { userService } from '@modules/users';
import { generateSuccess, generateReject } from '@infrastructure/http/response';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';

/**
 * Find the account holding a LIVE token of this type, without spending it.
 *
 * Live means: the entry exists, its type matches, and it has not expired. An entry with no
 * `expiration` never expires — that is how a token issued with a non-positive TTL is stored, and
 * treating absent as "expired" would revoke exactly those.
 *
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @returns the holder, or `undefined` for every kind of refusal — see the note above
 */
export const findLiveToken = (
    type: Token['type'],
    token: string
): Promise<UserDocument | undefined> =>
    userRepository.findByToken(token, type).then((user) => {
        if (!user) return undefined;

        const entry = user.tokens.find((tk) => tk.token === token && tk.type === type);
        if (!entry) return undefined;
        if (entry.expiration && entry.expiration < new Date()) return undefined;

        return user;
    });

/**
 * Spend a token found by {@link findLiveToken}, atomically.
 *
 * Delegates to `userService.consumeToken`, which owns the `$pull` and keeps the loaded document in
 * step with the write. Re-exported through this file rather than reached directly by the
 * controllers so that the two halves of one rule are asked for from one place.
 *
 * @returns `true` only for the request whose own write removed the entry. A `false` here is the
 *   loser of a race between two simultaneous uses of one link, and is answered exactly like a
 *   token that never existed.
 */
export const spendLiveToken = (user: UserDocument, token: string): Promise<boolean> =>
    userService.consumeToken(user, token);

/**
 * Map one stored refresh token to the wire's `Session`.
 *
 * The token VALUE never leaves this function — a live refresh token is as good as a password — so
 * the subdocument id is the handle, and `current` is derived by comparing against the caller's own
 * refresh cookie. A caller authenticating by bearer token alone has no cookie, and an access token
 * does not identify a session, so every entry is honestly `current: false`.
 */
const toSession = (token: Token, cookieToken?: string): Session => ({
    id: String(token._id),
    ...(token.expiration ? { expiration: token.expiration.toISOString() } : {}),
    // Absent until this token has been exchanged at least once — an unused session reads as
    // unused rather than as one that happens to share the moment it was issued.
    ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt.toISOString() } : {}),
    current: cookieToken !== undefined && token.token === cookieToken
});

/**
 * The authenticated user's live sessions, as `GET /account/sessions` publishes them.
 *
 * Refresh tokens only, and that filter is the reason this is a service function rather than four
 * lines in the controller it used to live in. The other kinds a document holds — a pending reset,
 * a delete confirmation, a verification link — are one-time secrets in flight, not sessions, and
 * listing them would disclose that such an operation is pending on the account. Written here, the
 * rule is one filter with a reason attached; written in the controller, it was a `.filter()` that
 * the next person to add a token type had to notice and think about.
 *
 * @param userId - the authenticated caller's own id; this endpoint reads no one else's sessions
 * @param cookieToken - the caller's refresh cookie, when they sent one, to mark the current row
 */
export const sessionsList = (
    userId: string,
    cookieToken?: string
): Promise<ResponseSuccess<{ sessions: Session[] }> | ResponseReject> =>
    // `tokens` is `select: false` — listing them is this endpoint's whole point.
    userRepository.findByIdWithCredentials(userId).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        const sessions = user.tokens
            .filter((token) => token.type === (TokenType.REFRESH as string))
            .map((token) => toSession(token, cookieToken));

        return generateSuccess({ sessions });
    });
