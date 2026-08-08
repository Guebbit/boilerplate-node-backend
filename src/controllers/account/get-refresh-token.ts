import type { Request, Response } from 'express';
import { createAccessToken } from '@middlewares/auth-jwt';
import { rejectResponse, successResponse } from '@core/http/response';
import { runTokenCleanup } from '@jobs/token-cleanup';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';
import { authRefreshTotal } from '@core/observability/metrics-domain';

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
                action: AuditAction.AUTH_REFRESH_FAILED,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                outcome: 'failure',
                metadata: { reason: 'missing_token' }
            })
        );
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }

    /**
     * Create new access token using refresh token stored in the server
     */
    return runTokenCleanup().then(() =>
        createAccessToken(refreshToken)
            .then((token) => {
                authRefreshTotal.inc({ status: 'success' });
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.AUTH_REFRESH_SUCCEEDED,
                        outcome: 'success'
                    })
                );
                successResponse(response, { token });
            })
            .catch(() => {
                authRefreshTotal.inc({ status: 'failure' });
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.AUTH_REFRESH_FAILED,
                        actor_user_id: 'anonymous',
                        actor_role: 'anonymous',
                        outcome: 'failure',
                        metadata: { reason: 'invalid_token' }
                    })
                );
                rejectResponse(response, 401, 'Unauthorized');
            })
    );
};
