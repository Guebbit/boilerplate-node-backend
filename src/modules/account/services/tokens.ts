/**
 * The user's `tokens` array, owned in one place.
 *
 * Every account flow that is not a password — the reset link, the verification link, the delete
 * confirmation, and the refresh tokens that back a session list — is an entry in that array, and
 * for a long time each of them read it for itself. Three controllers held byte-identical copies of
 *
 *     const entry = user.tokens.find((tk) => tk.token === token && tk.type === '<one type>');
 *     if (!entry || (entry.expiration && entry.expiration < new Date())) → 422
 *
 * differing only in the type literal, and a fourth read the array directly to decide which entries
 * were sessions. Nothing was wrong with any single copy. What was wrong is that "a token is live if
 * it exists, matches its type, and has not expired" had no owner, so the fifth flow to be written
 * would have had to rediscover it — and a flow that forgets the expiry comparison does not fail
 * loudly, it ships a link that works forever.
 *
 * So the rule lives here, once, and the flows above ask for it by name.
 *
 * ── Why find and spend are two functions ──────────────────────────────────────────────────────
 *
 * They look like one operation and are deliberately not, because `post-reset-confirm` has to put
 * something between them: it validates the new password BEFORE spending the token, so a mistyped
 * confirmation cannot burn a link the user then has to request again. A single `findAndSpend`
 * would either force that validation to happen after the burn, or grow a callback parameter to
 * let the caller inject work into the middle — which is the same two functions with more
 * ceremony.
 *
 * The split is also where the concurrency answer lives. {@link findLiveToken} is a READ: two
 * simultaneous clicks on one link both find the entry and both pass it. Only
 * {@link spendLiveToken} can separate them, because only its `$pull` is atomic — see
 * `userRepository.tokenRemove`. A caller that must be certain it was first calls both; a caller
 * whose success already destroys the token (deleting the account takes its tokens with it) calls
 * only the first.
 *
 * ── Why a refusal carries no reason ──────────────────────────────────────────────────────────
 *
 * {@link findLiveToken} answers `undefined` for a token that never existed, one of the wrong type,
 * one that expired, and one already spent. That is not laziness about error reporting — it is the
 * rule. All four are answered to the client identically, so that following a dead link cannot be
 * told apart from inventing one, and so that the answer never confirms an account exists. Encoding
 * the four cases as one absence is what stops a future caller helpfully distinguishing them.
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
