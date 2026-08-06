import type { Request, Response, NextFunction } from 'express';
import { userRepository } from '@repositories/users';
import type { IToken } from '@models/users';
import { verifyAccessToken } from './auth-jwt';
import { verifyRefreshToken } from './token';
import { t } from '@core/i18n';
import { rejectResponse } from '@core/http/response';
import { emitAuditEvent, AuditAction, buildAuditEvent } from '@core/observability/audit';

/**
 * Get token (and strip it from "Bearer" prefix)
 * @param request
 */
export const getTokenBearer = (request: Request) =>
    request.header('Authorization')?.split(' ')[1] as IToken['token'] | undefined;

/**
 * Get user data (if authenticated, otherwise go on)
 *
 * @param request
 * @param response
 * @param next
 */
export const getAuth = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);

    if (!token) {
        next();
        return;
    }

    verifyAccessToken(token)
        .then(({ id }) => userRepository.findById(id))
        .then((user) => {
            if (user) {
                request.authContext = {
                    id: user.id,
                    email: user.email,
                    username: user.username,
                    admin: user.admin ?? false,
                    imageUrl: user.imageUrl
                };
            }
        })
        .catch(() => {
            // Invalid or expired token — proceed without authenticated user
        })
        .finally(next);
};

/**
 * Unauthorized: Don't know who you are
 *
 * @param request
 * @param response
 * @param next
 */
export const isAuth = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);

    if (!request.authContext || !token) {
        emitAuditEvent(
            buildAuditEvent(request, {
                action: AuditAction.SECURITY_UNAUTHORIZED,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                outcome: 'failure',
                metadata: { route: request.path, method: request.method }
            })
        );
        rejectResponse(response, 401, 'Unauthorized');
        return;
    }

    next();
};

/**
 * Always AFTER isAuth
 *
 * @param request
 * @param response
 * @param next
 */
export const isAdmin = (request: Request, response: Response, next: NextFunction) => {
    if (!request.authContext) {
        emitAuditEvent(
            buildAuditEvent(request, {
                action: AuditAction.SECURITY_FORBIDDEN,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                outcome: 'failure',
                metadata: {
                    route: request.path,
                    method: request.method,
                    reason: 'not_authenticated'
                }
            })
        );
        rejectResponse(response, 403, 'Forbidden: Access denied.');
        return;
    }
    if (!request.authContext.admin) {
        emitAuditEvent(
            buildAuditEvent(request, {
                action: AuditAction.SECURITY_FORBIDDEN,
                outcome: 'failure',
                metadata: { route: request.path, method: request.method, reason: 'not_admin' }
            })
        );
        rejectResponse(response, 403, "Forbidden: You don't have permission.");
        return;
    }
    next();
};

/**
 * Admin check for endpoints a BROWSER opens without being able to set a header.
 *
 * `EventSource` — the only way a browser consumes SSE — cannot set request headers. That is a
 * hard limitation of the API, not an oversight, so `isAuth` (which reads `Authorization: Bearer`)
 * can never be satisfied by an SSE connection. What `EventSource` *does* send, given
 * `withCredentials: true`, is cookies; the frontend already opens the stream that way, and this
 * app already issues an `HttpOnly` refresh cookie at login.
 *
 * So the refresh cookie is the credential here. It is verified exactly as `GET /account/refresh`
 * verifies it — signature *and* presence on the user document — so a revoked or logged-out token
 * is rejected, not merely an expired one.
 *
 * The alternative, a token in the query string, is why this does not do that: URLs land in
 * access logs, proxy logs, browser history and `Referer` headers, and a refresh token in any of
 * those is a full account takeover.
 *
 * @param request
 * @param response
 * @param next
 */
export const isAdminViaCookie = (request: Request, response: Response, next: NextFunction) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>).jwt;

    if (!refreshToken) {
        rejectResponse(response, 401, 'isAdminViaCookie - no session cookie', [
            { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
        ]);
        return;
    }

    verifyRefreshToken(refreshToken)
        .then(({ id }) => userRepository.findById(id))
        .then((user) => {
            if (!user?.admin) {
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: AuditAction.SECURITY_FORBIDDEN,
                        actor_user_id: user?.id ?? 'anonymous',
                        outcome: 'failure'
                    })
                );
                rejectResponse(response, 403, 'isAdminViaCookie - not an admin', [
                    { code: 'FORBIDDEN', message: t('generic.error-forbidden') }
                ]);
                return;
            }

            request.authContext = {
                id: user.id,
                email: user.email,
                username: user.username,
                admin: true,
                imageUrl: user.imageUrl
            };
            next();
        })
        .catch(() =>
            rejectResponse(response, 401, 'isAdminViaCookie - invalid session', [
                { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
            ])
        );
};
