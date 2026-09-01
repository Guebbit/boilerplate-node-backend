/**
 * @module
 * `GET /account/refresh` controller — thin HTTP adapter over `accountService.refreshAccessToken`,
 * with a housekeeping token sweep run ahead of it.
 */

import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { logger } from '@infrastructure/adapters/logger';
import { accountService, runTokenCleanup } from '../services';
import { createRefreshCookie, createLoggedCookie } from '../session/cookies';
import { authRefreshTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * GET /account/refresh — mints a new short-lived access token from the refresh cookie, and, since
 * BETTER_SECURITY.md wave 3.2, ROTATES the refresh cookie too: every exchange replaces the
 * refresh token's value, so `refreshAccessToken`'s result carries the new cookie's `maxAge`
 * alongside the tokens. Cookie-only by design: a refresh token in the URL would land in browser
 * history, proxy logs and `Referer` headers; the `HttpOnly` cookie doesn't leak that way.
 */
export const getRefreshToken = (request: Request, response: Response) => {
    // Cookie name 'jwt' is decided in post-login.ts.
    const refreshToken = (request.cookies as Record<string, string | undefined>).jwt;

    /*
     * Cleanup is skipped when there's no cookie: it's a collection-wide sweep, and running it for
     * a request that can't succeed would let anonymous traffic schedule database work.
     * `refreshAccessToken` records the absence itself as one of its three outcomes.
     */
    return (refreshToken ? runTokenCleanup() : Promise.resolve())
        .then(() =>
            accountService
                .refreshAccessToken(refreshToken, callerContextOf(request))
                .then(({ accessToken, refreshToken: rotated, refreshMaxAgeMs }) => {
                    // The rotated value replaces the client's cookie in the SAME response —
                    // without this the client keeps presenting the now-superseded token, which
                    // its next refresh has to survive via the grace window rather than needing to.
                    createRefreshCookie(response, rotated, refreshMaxAgeMs);
                    createLoggedCookie(response, refreshMaxAgeMs);
                    authRefreshTotal.inc({ status: 'success' });
                    successResponse(response, { token: accessToken });
                })
                .catch(() => {
                    authRefreshTotal.inc({ status: 'failure' });
                    rejectResponse(response, 401);
                })
        )
        .catch((error: Error) => {
            // `runTokenCleanup` is housekeeping: it removes expired tokens and has nothing to do with
            // whether THIS refresh is valid. Without this catch its rejection escapes to the global
            // handler and a routine maintenance failure answers 500 to a request that was fine.
            logger.error({ message: 'Token cleanup failed during refresh.', error: error.message });
            rejectDatabaseError(response, 'getRefreshToken', error);
        });
};
