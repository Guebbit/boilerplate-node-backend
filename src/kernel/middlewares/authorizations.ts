import type { Request, Response, NextFunction } from 'express';
import { resolveAccessToken, resolveRefreshToken } from '@kernel/authentication';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import {
    emitAuditEvent,
    coreAuditActions,
    buildAuditEvent
} from '@infrastructure/observability/audit';

/**
 * Get token (and strip it from "Bearer" prefix)
 * @param request
 */
export const getTokenBearer = (request: Request) => request.header('Authorization')?.split(' ')[1];

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

    resolveAccessToken(token)
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

    // Audited before rejecting: a failed auth attempt is exactly what the trail exists to record.
    if (!request.authContext || !token) {
        emitAuditEvent(
            buildAuditEvent(request, {
                action: coreAuditActions.SECURITY_UNAUTHORIZED,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                outcome: 'failure',
                metadata: { route: request.path, method: request.method }
            })
        );
        rejectResponse(response, 401);
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
    /*
     * No credentials at all — 401, not 403. Unreachable through the current routes, which all mount
     * `isAuth` first; it guards a future mount that forgets.
     *
     * See: docs/tools/security.md#_401-or-403-and-why-the-guards-agree
     */
    if (!request.authContext) {
        emitAuditEvent(
            buildAuditEvent(request, {
                action: coreAuditActions.SECURITY_UNAUTHORIZED,
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
        rejectResponse(response, 401);
        return;
    }
    if (!request.authContext.admin) {
        emitAuditEvent(
            buildAuditEvent(request, {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                outcome: 'failure',
                metadata: { route: request.path, method: request.method, reason: 'not_admin' }
            })
        );
        rejectResponse(response, 403);
        return;
    }
    next();
};

/**
 * Admin check for endpoints a BROWSER opens without being able to set a header — SSE, via
 * `EventSource`, which cannot send `Authorization`. The refresh cookie is the credential, verified
 * as `GET /account/refresh` verifies it: signature *and* presence on the user document, so a
 * revoked token is rejected rather than merely an expired one.
 *
 * See: docs/tools/security.md#why-the-sse-endpoints-authenticate-by-cookie
 *
 * @param request - the incoming request, whose `jwt` cookie carries the refresh token
 * @param response - answered 401 without a cookie, 403 for a verified non-admin
 * @param next - called only once an admin is resolved onto `request.authContext`
 */
export const isAdminViaCookie = (request: Request, response: Response, next: NextFunction) => {
    const refreshToken = (request.cookies as Record<string, string | undefined>).jwt;

    // No cookie is 401 (who are you); a valid cookie for a non-admin is 403 (not you) — see below.
    if (!refreshToken) {
        rejectResponse(response, 401, [
            { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
        ]);
        return;
    }

    resolveRefreshToken(refreshToken)
        .then((user) => {
            if (!user?.admin) {
                emitAuditEvent(
                    buildAuditEvent(request, {
                        action: coreAuditActions.SECURITY_FORBIDDEN,
                        actor_user_id: user?.id ?? 'anonymous',
                        outcome: 'failure'
                    })
                );
                rejectResponse(response, 403, [
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
            rejectResponse(response, 401, [
                { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
            ])
        );
};
