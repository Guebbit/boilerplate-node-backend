import type { Request, Response } from 'express';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { logger } from '@infrastructure/adapters/logger';
import { accountService, runTokenCleanup } from '../services';
import { authRefreshTotal } from '../metrics';
import { callerContextOf } from '@infrastructure/http/request';

/**
 * GET /account/refresh
 * Refresh access token.
 * Given the refreshToken from the user's `jwt` cookie, create a new short-lived access token for
 * the following requests.
 *
 * The cookie is the only accepted source. A refresh token in the URL path lands in browser
 * history, proxy logs and `Referer` headers, readable by anything that can see the request line;
 * the `HttpOnly` cookie is not.
 */
export const getRefreshToken = (request: Request, response: Response) => {
    /**
     * Get token
     * (name of the cookie decided in the post-login.ts controller)
     */
    const refreshToken = (request.cookies as Record<string, string | undefined>).jwt;

    /**
     * Create new access token using refresh token stored in the server
     *
     * Cleanup is skipped when there is no cookie. It is a collection-wide sweep, and a request that
     * cannot succeed is the cheapest rejection this API has — running the sweep for it would let
     * anonymous traffic schedule database work. The refusal itself is `refreshAccessToken`'s to
     * make and to record: absence is one of the three outcomes it reports on.
     */
    return (refreshToken ? runTokenCleanup() : Promise.resolve())
        .then(() =>
            accountService
                .refreshAccessToken(refreshToken, callerContextOf(request))
                .then((token) => {
                    authRefreshTotal.inc({ status: 'success' });
                    successResponse(response, { token });
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
