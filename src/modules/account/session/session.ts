/**
 * @module
 * `issueSession` — the three-step tail every flow that mints or re-mints a live session runs: a
 * refresh token, its cookies, and the access token handed back to the caller. Extracted from
 * `postLogin` so `postPasswordChange` reuses it instead of
 * re-implementing cookie minting a second time. See docs/modules/account-sessions.md.
 */

import type { Response } from 'express';
import { createRefreshToken, createAccessToken } from './jwt';
import { createRefreshCookie, createLoggedCookie } from './cookies';
import type { RefreshTokenExpiryTime } from './config';

/**
 * Mint a refresh token, set its cookies on `response`, and exchange it for an access token.
 * @param response - the live response to set the refresh/logged cookies on
 * @param userId - whose session this is
 * @param remember - "remember me" tier; absent matches `postLogin`'s own default
 * @returns the signed access token to hand back in the response body
 * @throws when the refresh token cannot be persisted or signed
 */
export const issueSession = (
    response: Response,
    userId: string,
    remember?: RefreshTokenExpiryTime
): Promise<string> =>
    createRefreshToken(userId, remember).then((refreshToken) => {
        createRefreshCookie(response, refreshToken, remember);
        createLoggedCookie(response, remember);
        return createAccessToken(refreshToken);
    });
