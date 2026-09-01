/**
 * @module
 * Express guards built on `kernel/authentication.ts`'s resolver: `getAuth` populates
 * `request.authContext` when a token is present, `isAuth`/`isAdmin` reject when it is missing or
 * insufficient, `isAdminViaCookie` is the SSE-only variant that authenticates by refresh cookie
 * instead of an `Authorization` header, and `requireFreshAuth`/`requireFreshAuthWhen` (wave 4)
 * gate an already-authenticated caller on HOW RECENTLY they proved it. Every rejection from the
 * identity guards is audited before the response is sent, so a denied request always leaves a
 * trail.
 *
 * See: docs/tools/security.md
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveAccessToken, resolveRefreshToken } from '@kernel/authentication';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { environmentNumber } from '@infrastructure/runtime/environment';
import {
    emitAuditEvent,
    coreAuditActions,
    buildAuditEvent
} from '@infrastructure/observability/audit';

/**
 * Pull the bearer token out of the `Authorization` header, if any.
 *
 * @param request - the incoming request
 * @returns the token, or `undefined` when the header is absent or has no second segment
 */
export const getTokenBearer = (request: Request) => request.header('Authorization')?.split(' ')[1];

/**
 * Resolve `request.authContext` from a bearer token when one is present, then always continue.
 *
 * Never rejects: an absent or invalid token just leaves `authContext` unset, so this can sit in
 * front of routes that work for both anonymous and authenticated callers — `isAuth`/`isAdmin`
 * are what actually gate a route.
 *
 * @param request - populated with `authContext` on success
 * @param response - unused; kept for the Express middleware signature
 * @param next - always called, whether or not a user was resolved
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
                    imageUrl: user.imageUrl,
                    authTime: user.authTime,
                    amr: user.amr,
                    analyticsConsent: user.analyticsConsent
                };
            }
        })
        .catch(() => {
            // Invalid or expired token — proceed without authenticated user
        })
        .finally(next);
};

/**
 * Reject with 401 unless `getAuth` already resolved a caller onto the request.
 *
 * @param request - must already carry `authContext`, set upstream by `getAuth`
 * @param response - answered 401 when no caller was resolved
 * @param next - called only once a caller is confirmed present
 */
export const isAuth = (request: Request, response: Response, next: NextFunction) => {
    const token = getTokenBearer(request);

    // Audited before rejecting: a failed auth attempt is exactly what the trail exists to record.
    if (!request.authContext || !token) {
        emitAuditEvent(
            buildAuditEvent(callerContextOf(request), {
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
 * Reject with 403 unless the resolved caller is an admin. MUST run after `isAuth`.
 *
 * @param request - must already carry `authContext`, set upstream by `getAuth`/`isAuth`
 * @param response - answered 401 with no caller at all, 403 for a non-admin caller
 * @param next - called only once an admin caller is confirmed
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
            buildAuditEvent(callerContextOf(request), {
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
            buildAuditEvent(callerContextOf(request), {
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
                    buildAuditEvent(callerContextOf(request), {
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
                imageUrl: user.imageUrl,
                authTime: user.authTime,
                amr: user.amr,
                analyticsConsent: user.analyticsConsent
            };
            next();
        })
        .catch(() =>
            rejectResponse(response, 401, [
                { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
            ])
        );
};

/**
 * The two step-up tiers, read through `environmentNumber` exactly like the token TTLs are.
 * Kernel-level, not `account`'s: `requireFreshAuth` is mounted
 * by any module with a money or identity route — `cart`, `payments`, `account` itself — and none
 * of them may reach into a sibling's config to get at it.
 */
export const REAUTH_TIME_CRITICAL = environmentNumber('NODE_REAUTH_TIME_CRITICAL', 300);

/** Identity changes, session management — the lighter of the two tiers. */
export const REAUTH_TIME_SENSITIVE = environmentNumber('NODE_REAUTH_TIME_SENSITIVE', 900);

/**
 * Reject with a step-up challenge unless the caller proved themselves within `maxAgeSeconds`.
 * MUST run after `isAuth`.
 *
 * **401, not 403** — this repository's own rule (docs/tools/security.md), not just RFC 9470's:
 * the status names the client's next move, and 401 means "authenticate and try again", which is
 * the literal definition of step-up. The rejection carries both dialects: `WWW-Authenticate` for
 * anything that speaks OAuth, this app's own `errors[].code` envelope for its own clients, which
 * read `errors[].code` and never the header.
 *
 * @param maxAgeSeconds - how recently `authContext.authTime` must have been set —
 *   {@link REAUTH_TIME_CRITICAL} or {@link REAUTH_TIME_SENSITIVE}
 */
export const requireFreshAuth =
    (maxAgeSeconds: number) => (request: Request, response: Response, next: NextFunction) => {
        // Defensive, not the expected path: a route mounting this without `isAuth` first would
        // otherwise read `undefined.authTime` and throw. Same shape as `isAdmin`'s guard above.
        if (!request.authContext) {
            rejectResponse(response, 401);
            return;
        }

        const ageSeconds = Math.floor(Date.now() / 1000) - request.authContext.authTime;
        if (ageSeconds <= maxAgeSeconds) {
            next();
            return;
        }

        response.setHeader(
            'WWW-Authenticate',
            `Bearer error="insufficient_user_authentication", max_age=${maxAgeSeconds}`
        );
        rejectResponse(response, 401, [
            {
                code: 'REAUTH_REQUIRED',
                message: t('generic.error-reauth-required'),
                details: { maxAge: maxAgeSeconds }
            }
        ]);
    };

/**
 * `requireFreshAuth`, but only when `predicate` says this particular request needs it — for a
 * route where freshness depends on WHAT changed, not just who's asking. `PUT /account` is why
 * this exists: it only needs a fresh session when the email is changing, and an unconditional
 * gate would prompt for a password on every avatar upload — a prompt people learn to dismiss is a
 * prompt that protects nothing.
 *
 * **Mount order matters when `predicate` reads `request.body`.** `PUT /account` accepts
 * `multipart/form-data`, so `request.body` does not exist until `upload.single(...)` has run — a
 * predicate guard mounted before it reads an empty object and gates nothing. Mount this AFTER
 * whatever populates the body the predicate reads.
 *
 * @param predicate - reads the request and decides whether THIS one needs a fresh session
 * @param maxAgeSeconds - passed through to {@link requireFreshAuth} when the predicate is true
 */
export const requireFreshAuthWhen =
    (predicate: (request: Request) => boolean, maxAgeSeconds: number) =>
    (request: Request, response: Response, next: NextFunction) => {
        if (!predicate(request)) {
            next();
            return;
        }
        requireFreshAuth(maxAgeSeconds)(request, response, next);
    };
