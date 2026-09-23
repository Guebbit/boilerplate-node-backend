/**
 * @module
 * The user's `tokens` array, owned in one place: every non-password flow (reset, verification,
 * delete confirmation, refresh sessions) is an entry in it, "live" is defined once here.
 * {@link findLiveToken}/{@link spendLiveToken} stay separate for `two-factor.ts`, which does other
 * work between finding a challenge and spending it; {@link redeemLiveToken} composes both for the
 * four confirm controllers that don't — a refusal never says why.
 */

import type { Session } from '@types';
import {
    userService,
    hashToken,
    isLiveRefreshSession,
    type Token,
    type UserDocument
} from '@modules/users';
import { generateSuccess, generateReject } from '@infrastructure/http/response';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';

/**
 * Find the account holding a LIVE token of this type, without spending it — and the entry
 * itself, for the one caller that needs more than just its holder (`verifyLoginChallenge`, which
 * reads `entry.amr` back off an `MFA_CHALLENGE`).
 * Live means: exists, right type, not expired. An entry with no `expiration` never expires —
 * that's how a non-positive TTL is stored, and treating absent as "expired" would revoke exactly those.
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @returns the holder and the matched entry, or `undefined` for every kind of refusal — see the note above
 */
export const findLiveTokenEntry = (
    type: Token['type'],
    token: string
): Promise<{ user: UserDocument; entry: Token } | undefined> =>
    userService.findByToken(token, type).then((user) => {
        if (!user) return undefined;

        // `tokens[].token` is hashed at rest — hash `token` the same way to re-find it on the
        // just-loaded document.
        const digest = hashToken(token);
        const entry = user.tokens.find((tk) => tk.token === digest && tk.type === type);
        if (!entry) return undefined;
        if (entry.expiration && entry.expiration < new Date()) return undefined;

        return { user, entry };
    });

/**
 * {@link findLiveTokenEntry}, for the common case that only cares who holds the token.
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @returns the holder, or `undefined` for every kind of refusal — see {@link findLiveTokenEntry}
 */
export const findLiveToken = (
    type: Token['type'],
    token: string
): Promise<UserDocument | undefined> =>
    findLiveTokenEntry(type, token).then((found) => found?.user);

/**
 * Spend a token found by {@link findLiveToken}, atomically.
 * Delegates to `userService.consumeToken`, which owns the `$pull` and keeps the loaded document
 * in step with the write — re-exported here rather than reached directly so both halves of one
 * rule are asked for from one place.
 * @returns `true` only for the request whose own write removed the entry. A `false` here is the
 *   loser of a race between two simultaneous uses of one link, and is answered exactly like a
 *   token that never existed.
 */
export const spendLiveToken = (user: UserDocument, token: string): Promise<boolean> =>
    userService.consumeToken(user, token);

/**
 * {@link findLiveToken} then {@link spendLiveToken}, for a confirm controller that has no work of
 * its own to do between the two. `post-reset-confirm` is one of these too: its new-password check
 * is pure (no user, no database) and runs before this is ever called, so a typo in the password
 * never touches — and never burns — the link.
 * @param type - which kind of token the link claims to carry
 * @param token - the token value from the link the user followed
 * @returns the holder, once THIS request's spend removed the entry — `undefined` for every kind of
 *   refusal, including the losing side of a race between two uses of one link
 */
export const redeemLiveToken = (
    type: Token['type'],
    token: string
): Promise<UserDocument | undefined> =>
    findLiveToken(type, token).then((user) => {
        if (!user) return undefined;

        return spendLiveToken(user, token).then((spentByThisRequest) =>
            spentByThisRequest ? user : undefined
        );
    });

/**
 * Maps one stored refresh token to the wire's `Session`. The token VALUE never leaves this
 * function — a live refresh token is as good as a password — so the subdocument id is the
 * handle; `current` compares against the caller's own refresh cookie (bearer-only callers have
 * none, so every entry there is honestly `current: false`). `cookieToken` is hashed before the
 * comparison, since `token.token` is a digest at rest.
 */
const toSession = (token: Token, cookieToken?: string): Session => ({
    id: String(token._id),
    ...(token.expiration ? { expiration: token.expiration.toISOString() } : {}),
    // Absent until this token has been exchanged at least once — an unused session reads as
    // unused rather than as one that happens to share the moment it was issued.
    ...(token.lastUsedAt ? { lastUsedAt: token.lastUsedAt.toISOString() } : {}),
    current: cookieToken !== undefined && token.token === hashToken(cookieToken)
});

/**
 * The authenticated user's live sessions, as `GET /account/sessions` publishes them.
 * Refresh tokens only — a service function rather than a controller `.filter()`, because the
 * other kinds a document holds (pending reset, delete, verification links) are one-time secrets
 * in flight, not sessions, and listing them would disclose that such an operation is pending.
 * @param userId - the authenticated caller's own id; this endpoint reads no one else's sessions
 * @param cookieToken - the caller's refresh cookie, when they sent one, to mark the current row
 */
export const sessionsList = (
    userId: string,
    cookieToken?: string
): Promise<ResponseSuccess<{ sessions: Session[] }> | ResponseReject> =>
    // `tokens` is `select: false` — listing them is this endpoint's whole point.
    userService.findByIdWithCredentials(userId).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        const sessions = user.tokens
            .filter((token) => isLiveRefreshSession(token))
            .map((token) => toSession(token, cookieToken));

        return generateSuccess({ sessions });
    });
