/**
 * @module
 * `issueSession` — the three-step tail every flow that mints or re-mints a live session runs: a
 * refresh token, its cookies, and the access token handed back to the caller. Extracted from
 * `postLogin` so `postPasswordChange` reuses it instead of
 * re-implementing cookie minting a second time. See docs/modules/account-sessions.md.
 */

import type { Request, Response } from 'express';
import { readRefreshCookie } from '@kernel/cookies';
import { createRefreshToken, createAccessToken, rememberOfRefreshToken } from './jwt';
import { createRefreshCookie, createLoggedCookie } from './cookies';
import { getCookieMaxAgeMilliseconds, type RefreshTokenExpiryTime } from './config';

/**
 * Mint a refresh token, set its cookies on `response`, and exchange it for an access token.
 * @param response - the live response to set the refresh/logged cookies on
 * @param userId - whose session this is
 * @param remember - the ticked "remember me" tier; absent means a browser-session cookie, with a
 *   server-side TTL of the `short` tier
 * @param amr - how `auth_time` was proved; absent matches `createRefreshToken`'s own `['pwd']` default
 * @returns the signed access token to hand back in the response body
 * @throws when the refresh token cannot be persisted or signed
 */
export const issueSession = (
    response: Response,
    userId: string,
    remember?: RefreshTokenExpiryTime,
    amr?: string[]
): Promise<string> =>
    createRefreshToken(userId, remember, amr).then((refreshToken) => {
        const maxAgeMs = getCookieMaxAgeMilliseconds(remember);
        createRefreshCookie(response, refreshToken, maxAgeMs);
        createLoggedCookie(response, maxAgeMs);
        return createAccessToken(refreshToken);
    });

/**
 * Re-mint the caller's live session KEEPING its persistence: reauth and a password change replace
 * the session, and must neither strand a remembered login on a session cookie nor make a
 * browser-session one persistent. The tier is read off the request's own refresh cookie.
 *
 * @param request - the authenticated request, carrying the current refresh cookie if any
 * @param response - the live response to set the refresh/logged cookies on
 * @param userId - whose session this is
 * @param amr - how the re-minted session's `auth_time` was proved; absent keeps `issueSession`'s
 *   own `['pwd']`, right for a password change and wrong for a re-authentication, which passes
 *   the session's earlier proofs plus the new one
 * @returns the signed access token to hand back in the response body
 */
export const reissueSession = (
    request: Pick<Request, 'cookies'>,
    response: Response,
    userId: string,
    amr?: string[]
): Promise<string> =>
    rememberOfRefreshToken(readRefreshCookie(request), userId).then((remember) =>
        issueSession(response, userId, remember, amr)
    );
