import type { Request, Response } from 'express';
import { accountService } from '../services';
import { createRefreshToken, createAccessToken, RefreshTokenExpiryTime } from '../session/jwt';
import { createRefreshCookie, createLoggedCookie } from '../session/cookies';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import { rejectDatabaseError } from '@infrastructure/http/errors';
import type { LoginRequest } from '@types';
import { runTokenCleanup } from '../services';
import { authLoginTotal } from '../metrics';
import { emitAuditEvent, buildAuditEvent } from '@infrastructure/observability/audit';
import { accountAuditActions } from '../audit';
import { emitAnalyticsEvent, buildAnalyticsBase } from '@infrastructure/observability/analytics';
import { accountAnalyticsEvents } from '../analytics';

/**
 * Emit login failure observability (metrics + audit).
 */
const recordLoginFailure = (request: Request) => {
    authLoginTotal.inc({ status: 'failure' });
    emitAuditEvent(
        buildAuditEvent(request, {
            action: accountAuditActions.AUTH_LOGIN_FAILED,
            actor_user_id: 'anonymous',
            actor_role: 'anonymous',
            outcome: 'failure'
        })
    );
};

/**
 * Emit login success observability (metrics + audit + analytics).
 */
const recordLoginSuccess = (request: Request, userId: string, isAdmin: boolean) => {
    const role = isAdmin ? 'admin' : 'user';
    authLoginTotal.inc({ status: 'success' });
    emitAuditEvent(
        buildAuditEvent(request, {
            action: accountAuditActions.AUTH_LOGIN_SUCCEEDED,
            actor_user_id: userId,
            actor_role: role,
            outcome: 'success'
        })
    );
    emitAnalyticsEvent({
        ...buildAnalyticsBase(request),
        distinctId: userId,
        event: accountAnalyticsEvents.USER_LOGGED_IN,
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
        LoginRequest & { remember?: RefreshTokenExpiryTime }
    >,
    response: Response
) => {
    /*
     * Read, not parsed against `LoginBody`, and this one is a security decision rather than an
     * omission.
     *
     * A login answers ONE way for every wrong credential. Parsing first makes a password shorter
     * than the contract's minimum answer 422 while a wrong password of the right length answers
     * 401 — which tells a caller something about the secret they guessed. It also answers before
     * `recordLoginFailure`, so the failed attempt never reaches the audit trail: the request that
     * most needs recording becomes the one that is not.
     *
     * The credentials are checked against the stored hash, which is the only check that decides
     * anything here.
     */
    const { email, password, remember } = request.body;

    /*
     * Run token cleanup as a background pre-flight step, then authenticate.
     */
    return runTokenCleanup()
        .then(() => accountService.login(email, password))
        .then((result) => {
            if (!result.success) {
                // Record failed login before responding
                recordLoginFailure(request);
                rejectResponse(response, result.status, result.errors);
                return;
            }

            /*
             * Authentication successful.
             * Create refresh token and add it to the client cookies.
             */
            const { data } = result;
            if (data === undefined) {
                // A success verdict without a user is a broken service contract, not a login failure.
                rejectResponse(response, 500, []);
                return;
            }
            const userId = data._id.toString();
            const isAdmin = !!data.admin;

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
        })
        .catch((error: Error) => {
            // Covers the token cleanup, the credential check and the three token/cookie steps
            // after it. A failure in any of them is not a rejected login — the caller may well
            // have had the right password — so it must not be recorded as one.
            rejectDatabaseError(response, 'postLogin', error);
        });
};
