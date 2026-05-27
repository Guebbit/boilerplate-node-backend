import type { Request, Response } from 'express';
import { createAccessToken } from '@middlewares/auth-jwt';
import { rejectResponse, successResponse } from '@utils/response';
import { runTokenCleanup } from '@utils/token-cleanup';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * GET /account/refresh
 * Refresh access token.
 * Given the refreshToken from the user cookies:
 * create a new short-lived access token for the following requests.
 */
export const getRefreshToken = (request: Request, response: Response) => {
    /*
     * Get token from cookie (name set in post-login.ts)
     */
    const refreshToken = (request.cookies as Record<string, string | undefined>).jwt;

    /*
     * Check if refresh token is missing
     */
    if (!refreshToken) {
        emitAuditEvent({
            action: AuditAction.AUTH_REFRESH_FAILED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure',
            ...extractRequestContext(request),
            metadata: { reason: 'missing_token' }
        });
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }

    /*
     * Create new access token using refresh token stored in the server
     */
    return runTokenCleanup().then(() =>
        createAccessToken(refreshToken)
            .then((token) => {
                emitAuditEvent({
                    action: AuditAction.AUTH_REFRESH_SUCCEEDED,
                    actor_user_id: request.user?.id ?? 'anonymous',
                    actor_role: request.user?.admin ? 'admin' : request.user ? 'user' : 'anonymous',
                    outcome: 'success',
                    ...extractRequestContext(request)
                });
                successResponse(response, { token });
            })
            .catch(() => {
                emitAuditEvent({
                    action: AuditAction.AUTH_REFRESH_FAILED,
                    actor_user_id: 'anonymous',
                    actor_role: 'anonymous',
                    outcome: 'failure',
                    ...extractRequestContext(request),
                    metadata: { reason: 'invalid_token' }
                });
                rejectResponse(response, 401, 'Unauthorized');
            })
    );
};
