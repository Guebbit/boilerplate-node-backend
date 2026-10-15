/**
 * @module
 * `POST /account/refresh` controller — thin HTTP adapter over `accountService.refreshAccessToken`.
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { isInfrastructureError, rejectServiceUnavailable } from '@infrastructure/http/errors';
import type { RefreshTokenResponse } from '@types';
import { accountService } from '../services';
import { createSessionCookie } from '../session/cookies';
import { getSessionMode } from '../session/config';
import { authRefreshTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';
import { readSessionCookie } from '@kernel/cookies';

/**
 * POST /account/refresh — `jwt` mode only (404 in `cookie` mode). Mints a new short-lived access
 * token from the refresh cookie, and also ROTATES the refresh cookie too: every exchange replaces the
 * refresh token's value, so `refreshAccessToken`'s result carries the new cookie's `maxAge`
 * alongside the tokens. Cookie-only by design: a refresh token in the URL would land in browser
 * history, proxy logs and `Referer` headers; the `HttpOnly` cookie doesn't leak that way.
 */
export const getRefreshToken = (request: Request, response: Response) => {
    // A `cookie`-mode session has one credential that never rotates: there is nothing to refresh.
    if (getSessionMode() === 'cookie') {
        rejectResponse(response, 404);
        return;
    }

    const refreshToken = readSessionCookie(request);

    // `refreshAccessToken` records an absent cookie itself as one of its three outcomes.
    return (
        accountService
            .refreshAccessToken(refreshToken, callerContextOf(request))
            .then(({ accessToken, refreshToken: rotated, refreshMaxAgeMs }) => {
                // The rotated value replaces the client's cookie in the SAME response —
                // without this the client keeps presenting the now-superseded token, which
                // its next refresh has to survive via the grace window rather than needing to.
                createSessionCookie(response, rotated, refreshMaxAgeMs);
                authRefreshTotal.inc({ status: 'success' });
                successResponse<RefreshTokenResponse>(response, { token: accessToken });
            })
            // Every refusal of the token is the same 401: an unknown, expired, revoked or replayed
            // token must not be told apart by a client. An outage is not a refusal: the client
            // treats 401 as a definitive sign-out, so it gets a retryable 503 instead.
            .catch((error: unknown) => {
                if (isInfrastructureError(error)) {
                    rejectServiceUnavailable(response);
                    return;
                }
                authRefreshTotal.inc({ status: 'failure' });
                rejectResponse(response, 401);
            })
    );
};
