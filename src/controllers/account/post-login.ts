import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import { authService } from '@services/auth';
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
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@utils/audit';
import { emitAnalyticsEvent, AnalyticsEvent, buildAnalyticsBase } from '@utils/analytics';

/*
 * Emit login failure observability (metrics + audit).
 */
const recordLoginFailure = (request: Request) => {
    authLoginTotal.inc({ status: 'failure' });
    emitAuditEvent(
        buildAuditEvent(request, {
            action: AuditAction.AUTH_LOGIN_FAILED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure'
        })
    );
};

/*
 * Emit login success observability (metrics + audit + analytics).
 */
const recordLoginSuccess = (request: Request, userId: string, isAdmin: boolean) => {
    const role = isAdmin ? 'admin' : 'user';
    authLoginTotal.inc({ status: 'success' });
    emitAuditEvent(
        buildAuditEvent(request, {
            action: AuditAction.AUTH_LOGIN_SUCCEEDED,
            actor_user_id: userId,
            actor_role: role,
            outcome: 'success'
        })
    );
    emitAnalyticsEvent({
        ...buildAnalyticsBase(request),
        distinctId: userId,
        event: AnalyticsEvent.USER_LOGGED_IN,
        properties: { role }
    });
};

/**
 * POST /account/login
 * Authenticate user.
 * Returns a short-lived access token and sets a long-lived refresh cookie.
 */
export const postLogin = (
    request: Request<
        Record<string, string>,
        unknown,
        LoginRequest & { remember?: ERefreshTokenExpiryTime }
    >,
    response: Response
) => {
    /*
     * Get POST data.
     */
    const { email, password, remember } = request.body;

    /*
     * Run token cleanup as a background pre-flight step, then authenticate.
     */
    return runTokenCleanup()
        .then(() => authService.login(email, password))
        .then((result) => {
            if (!result.success) {
                // Record failed login before responding
                recordLoginFailure(request);
                rejectResponse(response, result.status, result.message, result.errors);
                return;
            }

            /*
             * Authentication successful.
             * Create refresh token and add it to the client cookies.
             */
            const userId = (result.data?._id as Types.ObjectId)?.toString();
            const isAdmin = !!result.data?.admin;

            return createRefreshToken(userId, remember)
                .then((refreshToken) => {
                    createRefreshCookie(response, refreshToken, remember);
                    createLoggedCookie(response, remember);
                    /*
                     * Send the newly created access token to the client through the response.
                     * It will be used for the following requests.
                     */
                    return createAccessToken(refreshToken);
                })
                .then((accessToken) => {
                    recordLoginSuccess(request, userId, isAdmin);
                    successResponse(
                        response,
                        { token: accessToken },
                        200,
                        'Authentication successful'
                    );
                });
        });
};
