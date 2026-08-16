import type { Request, Response } from 'express';
import { createAccessToken } from '../session/jwt';
import { rejectResponse, successResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import { logger } from '@infrastructure/adapters/logger';
import { runTokenCleanup } from '../services';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { authRefreshTotal } from '../metrics';

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
     * Check if refresh token is missing
     */
    if (!refreshToken) {
        authRefreshTotal.inc({ status: 'failure' });
        emitAuditEvent(
            buildAuditEvent(request, {
                action: accountAuditActions.AUTH_REFRESH_FAILED,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                outcome: 'failure',
                metadata: { reason: 'missing_token' }
            })
        );
        rejectResponse(response, 401);
        return;
    }

    /**
     * Create new access token using refresh token stored in the server
     */
    return runTokenCleanup()
        .then(() =>
            createAccessToken(refreshToken)
                .then((token) => {
                    authRefreshTotal.inc({ status: 'success' });
                    emitAuditEvent(
                        buildAuditEvent(request, {
                            action: accountAuditActions.AUTH_REFRESH_SUCCEEDED,
                            outcome: 'success'
                        })
                    );
                    successResponse(response, { token });
                })
                .catch(() => {
                    authRefreshTotal.inc({ status: 'failure' });
                    emitAuditEvent(
                        buildAuditEvent(request, {
                            action: accountAuditActions.AUTH_REFRESH_FAILED,
                            actor_user_id: 'anonymous',
                            actor_role: 'anonymous',
                            outcome: 'failure',
                            metadata: { reason: 'invalid_token' }
                        })
                    );
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
