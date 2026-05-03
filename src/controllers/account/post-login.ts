import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { userService } from '@services/users';
import {
    createRefreshToken,
    createRefreshCookie,
    createLoggedCookie,
    createAccessToken,
    ERefreshTokenExpiryTime
} from '@middlewares/auth-jwt';
import { successResponse, rejectResponse } from '@utils/response';
import type { LoginRequest } from '@types';
import { runTokenCleanup } from '@utils/token-cleanup';
import { authLoginTotal } from '@utils/domain-metrics';
import { emitAuditEvent, extractRequestContext, AuditAction } from '@utils/audit';

/**
 * POST /account/login
 * Authenticate user.
 * Returns a short-lived access token and sets a long-lived refresh cookie.
 */
export const postLogin = (
    request: Request<unknown, unknown, LoginRequest & { remember?: ERefreshTokenExpiryTime }>,
    response: Response
) => {
    /**
     * Get POST data
     */
    const { email, password, remember } = request.body;

    /**
     * Run token cleanup as a background pre-flight step, then authenticate.
     */
    return runTokenCleanup()
        .then(() => userService.login(email, password))
        .then((result) => {
            if (!result.success) {
                // Record failed login before responding
                authLoginTotal.inc({ status: 'failure' });
                emitAuditEvent({
                    action: AuditAction.AUTH_LOGIN_FAILED,
                    actor_user_id: 'anonymous',
                    actor_role: 'anonymous',
                    outcome: 'failure',
                    ...extractRequestContext(request)
                });
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }

            /**
             * Authentication successful.
             * Create refresh token...
             */
            const userId = (result.data?._id as Types.ObjectId)?.toString();
            return createRefreshToken(userId, remember)
                .then((refreshToken) => {
                    // ...and add it to the client cookies
                    createRefreshCookie(response, refreshToken, remember);
                    createLoggedCookie(response, remember);

                    /**
                     * Send the newly created access token to the client through the response.
                     * It will be used for the following requests.
                     */
                    return createAccessToken(refreshToken);
                })
                .then((accessToken) => {
                    authLoginTotal.inc({ status: 'success' });
                    emitAuditEvent({
                        action: AuditAction.AUTH_LOGIN_SUCCEEDED,
                        actor_user_id: userId,
                        actor_role: result.data?.admin ? 'admin' : 'user',
                        outcome: 'success',
                        ...extractRequestContext(request)
                    });
                    successResponse(
                        response,
                        { token: accessToken },
                        200,
                        'Authentication successful'
                    );
                });
        });
};
