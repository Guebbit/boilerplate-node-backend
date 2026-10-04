/**
 * @module
 * `GET /account/refresh` controller — thin HTTP adapter over `accountService.refreshAccessToken`.
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import type { RefreshTokenResponse } from '@types';
import { accountService } from '../services';
import { createRefreshCookie, createLoggedCookie } from '../session/cookies';
import { authRefreshTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { readRefreshCookie } from '@kernel/cookies';

/**
 * GET /account/refresh — mints a new short-lived access token from the refresh cookie, and also
 * ROTATES the refresh cookie too: every exchange replaces the
 * refresh token's value, so `refreshAccessToken`'s result carries the new cookie's `maxAge`
 * alongside the tokens. Cookie-only by design: a refresh token in the URL would land in browser
 * history, proxy logs and `Referer` headers; the `HttpOnly` cookie doesn't leak that way.
 */
export const getRefreshToken = (request: Request, response: Response) => {
    const refreshToken = readRefreshCookie(request);

    // `refreshAccessToken` records an absent cookie itself as one of its three outcomes, and prunes
    // the rotated account's own expired tokens once the rotation's lookup is done.
    return (
        accountService
            .refreshAccessToken(refreshToken, callerContextOf(request))
            .then(({ accessToken, refreshToken: rotated, refreshMaxAgeMs }) => {
                // The rotated value replaces the client's cookie in the SAME response —
                // without this the client keeps presenting the now-superseded token, which
                // its next refresh has to survive via the grace window rather than needing to.
                createRefreshCookie(response, rotated, refreshMaxAgeMs);
                createLoggedCookie(response, refreshMaxAgeMs);
                authRefreshTotal.inc({ status: 'success' });
                successResponse<RefreshTokenResponse>(response, { token: accessToken });
            })
            // Every failure of the exchange is the same 401: an unknown, expired, revoked or replayed
            // token must not be told apart by a client.
            .catch(() => {
                authRefreshTotal.inc({ status: 'failure' });
                rejectResponse(response, 401);
            })
    );
};
