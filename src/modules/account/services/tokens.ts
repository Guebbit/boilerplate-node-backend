/**
 * @module
 * The user's `tokens` array, owned in one place: every non-password flow (reset, verification,
 * delete confirmation, refresh sessions) is an entry in it, "live" is defined once here.
 * {@link findLiveToken}/{@link spendLiveToken} stay separate since only the spend's `$pull` is
 * atomic and `post-reset-confirm` validates before spending; a refusal never says why.
 */

import type { Session } from '@types';
import {
    userRepository,
    TokenType,
    hashToken,
    type Token,
    type UserDocument
} from '@modules/users';
import { userService } from '@modules/users';
import { generateSuccess, generateReject } from '@infrastructure/http/response';
import type { ResponseSuccess, ResponseReject } from '@infrastructure/http/response';
import { t } from '@infrastructure/i18n';

/**
 * Find the account holding a LIVE token of this type, without spending it.
 * Live means: exists, right type, not expired. An entry with no `expiration` never expires —
 * that's how a non-positive TTL is stored, and treating absent as "expired" would revoke exactly those.
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

        // `tokens[].token` is hashed at rest (wave 3.1) — hash `token` the same way to re-find it
        // on the just-loaded document.
        const digest = hashToken(token);
        const entry = user.tokens.find((tk) => tk.token === digest && tk.type === type);
        if (!entry) return undefined;
        if (entry.expiration && entry.expiration < new Date()) return undefined;

        return user;
    });

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
 * Maps one stored refresh token to the wire's `Session`. The token VALUE never leaves this
 * function — a live refresh token is as good as a password — so the subdocument id is the
 * handle; `current` compares against the caller's own refresh cookie (bearer-only callers have
 * none, so every entry there is honestly `current: false`). `cookieToken` is hashed before the
 * comparison, since `token.token` is a digest at rest (wave 3.1).
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
    userRepository.findByIdWithCredentials(userId).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        const sessions = user.tokens
            // `!token.supersededAt` — a rotated-away entry (wave 3.2) is kept around only for its
            // short reuse-detection grace window, not a session the account holder should see or
            // be able to revoke by itself; its successor already is one.
            .filter((token) => token.type === (TokenType.REFRESH as string) && !token.supersededAt)
            .map((token) => toSession(token, cookieToken));

        return generateSuccess({ sessions });
    });
