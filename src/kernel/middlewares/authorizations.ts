/**
 * @module
 * Express guards built on `kernel/authentication.ts`'s resolver: `getAuth` populates
 * `request.authContext` when a token is present, `isAuth` rejects when it is missing,
 * `requirePermission` rejects when the caller's role does not hold a given key,
 * `requirePermissionViaCookie` is the SSE-only variant that authenticates by refresh cookie
 * instead of an `Authorization` header, and `requireFreshAuth`/`requireFreshAuthWhen` gate an
 * already-authenticated caller on HOW RECENTLY they proved it. Every rejection from the
 * identity guards is audited before the response is sent, so a denied request always leaves a
 * trail.
 *
 * A guard takes a PERMISSION KEY, never a role name. A role is data a deployment may edit; a key
 * is code, declared beside the routes that check it, and `assertDeclared` refuses one no module
 * owns — so a typo in a mount is a boot failure rather than a route nobody can reach.
 *
 * See: docs/tools/security.md · docs/theory/authorization.md
 */

import type { Request, Response, NextFunction } from 'express';
import { resolveAccessToken, resolveRefreshToken } from '@kernel/authentication';
import { holdsKey } from '@kernel/ability';
import { assertDeclared, callerFor, callerInScope, wildcardKeyFor } from '@kernel/permissions';
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
 * front of routes that work for both anonymous and authenticated callers — `isAuth`/`requireUnrestricted`
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
                    roles: user.roles,
                    tenantId: user.tenantId,
                    imageUrl: user.imageUrl,
                    authTime: user.authTime,
                    amr: user.amr,
                    analyticsConsent: user.analyticsConsent,
                    verified: user.verified
                };
                // Resolved once, here, so nothing below turns two role names into keys again.
                request.caller = callerInScope(request.authContext, 'tenant');
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
 * Reject with 403 unless the resolved caller's role holds `key`. MUST run after `isAuth`.
 *
 * The key is checked against the declared set at MOUNT time, not at request time: a route guarded
 * by a key no module owns would otherwise answer 403 to everyone and look like a permissions
 * problem for as long as nobody tried it.
 *
 * @param key - the permission key this route requires, e.g. `products.update`
 * @throws Error at mount time when no module declares the key
 */
export const requirePermission = (key: string) => {
    assertDeclared(key);

    // Named, not anonymous: `tests/cross-cutting/write-routes-are-guarded.test.ts` and each
    // module's route sweep identify a guard by its function name, and a factory that returns an
    // arrow makes every mount read as unguarded.
    return function requirePermissionGuard(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        /*
         * No credentials at all — 401, not 403. Unreachable through the current routes, which all
         * mount `isAuth` first; it guards a future mount that forgets.
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

        /*
         * The guard asks the ability, not the key list, so a route and a query agree by
         * construction: both read the same rules. It asks about the ACTION and SUBJECT rather
         * than about the row, because a route guard runs before anything is fetched — which is
         * the whole point of keeping the row restriction in the read instead.
         */
        const allowed = holdsKey(callerFor(request.authContext, key), key);

        if (!allowed) {
            emitAuditEvent(
                buildAuditEvent(callerContextOf(request), {
                    action: coreAuditActions.SECURITY_FORBIDDEN,
                    outcome: 'failure',
                    metadata: {
                        route: request.path,
                        method: request.method,
                        reason: 'missing_permission',
                        permission: key
                    }
                })
            );
            rejectResponse(response, 403);
            return;
        }

        next();
    };
};

/**
 * {@link requirePermission} for endpoints a BROWSER opens without being able to set a header —
 * SSE, via `EventSource`, which cannot send `Authorization`. The refresh cookie is the credential,
 * verified as `GET /account/refresh` verifies it: signature *and* presence on the user document,
 * so a revoked token is rejected rather than merely an expired one.
 *
 * See: docs/tools/security.md#why-the-sse-endpoints-authenticate-by-cookie
 *
 * @param key - the permission key this route requires
 * @throws Error at mount time when no module declares the key
 */
export const requirePermissionViaCookie = (key: string) => {
    assertDeclared(key);

    // Named for the same reason as `requirePermissionGuard` above.
    return function requirePermissionViaCookieGuard(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        const refreshToken = (request.cookies as Record<string, string | undefined>).jwt;

        // No cookie is 401 (who are you); a valid cookie without the key is 403 (not you).
        if (!refreshToken) {
            rejectResponse(response, 401, [
                { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
            ]);
            return;
        }

        resolveRefreshToken(refreshToken)
            .then((user) => {
                const allowed = user !== undefined && holdsKey(callerFor(user, key), key);

                if (!allowed) {
                    emitAuditEvent(
                        buildAuditEvent(callerContextOf(request), {
                            action: coreAuditActions.SECURITY_FORBIDDEN,
                            actor_user_id: user?.id ?? 'anonymous',
                            outcome: 'failure',
                            metadata: { reason: 'missing_permission', permission: key }
                        })
                    );
                    rejectResponse(response, 403, [
                        { code: 'FORBIDDEN', message: t('generic.error-forbidden') }
                    ]);
                    return;
                }

                request.authContext = user;
                request.caller = callerInScope(user, 'tenant');
                next();
            })
            .catch(() =>
                rejectResponse(response, 401, [
                    { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
                ])
            );
    };
};

/**
 * Reject with 403 unless the caller holds the WILDCARD key for their tenant scope. MUST run after
 * `isAuth`.
 *
 * `admin` is this guard's word for UNRESTRICTED, not a role name — the same definition the audit
 * trail uses, and for the same reason: role names are data a deployment may rename or add to,
 * while "holds the wildcard" is a property of the permission model itself. A route that wants a
 * narrower rule should mount {@link requirePermission} with the key it actually needs; this is
 * the blanket gate for routes whose whole surface is operator-only.
 */
export const requireUnrestricted = (request: Request, response: Response, next: NextFunction) => {
    const wildcard = wildcardKeyFor('tenant');

    /*
     * No credentials at all — 401, not 403, and audited as an AUTHENTICATION failure rather than
     * a permission one. Unreachable through the current routes, which all mount `isAuth` first;
     * it guards a future mount that forgets.
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

    if (!holdsKey(callerFor(request.authContext, wildcard), wildcard)) {
        emitAuditEvent(
            buildAuditEvent(callerContextOf(request), {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                outcome: 'failure',
                metadata: {
                    route: request.path,
                    method: request.method,
                    reason: 'missing_permission',
                    permission: wildcard
                }
            })
        );
        rejectResponse(response, 403, [
            { code: 'FORBIDDEN', message: t('generic.error-forbidden') }
        ]);
        return;
    }

    next();
};

/**
 * {@link requireUnrestricted} for endpoints a BROWSER opens without being able to set a header — same cookie
 * credential and same verification as {@link requirePermissionViaCookie}, which this delegates to
 * rather than restating: one code path for "verify the cookie, then check a key".
 */
export const requireUnrestrictedViaCookie = requirePermissionViaCookie(wildcardKeyFor('tenant'));

/**
 * The two step-up tiers, read through `environmentNumber` exactly like the token TTLs are.
 * Kernel-level, not `account`'s: `requireFreshAuth` is mounted
 * by any module with a money or identity route — `cart`, `payments`, `account` itself — and none
 * of them may reach into a sibling's config to get at it.
 */
export const REAUTH_TIME_CRITICAL = environmentNumber('NODE_REAUTH_TIME_CRITICAL', 300);

/** Identity changes, session management — the lighter of the two tiers. */
export const REAUTH_TIME_SENSITIVE = environmentNumber('NODE_REAUTH_TIME_SENSITIVE', 900);

/** What {@link requireFreshAuth} may additionally demand, beyond how recently. */
export interface FreshAuthOptions {
    /**
     * Every one of these RFC 8176 values must appear in `authContext.amr` — fresh AND
     * second-factored. `requireFreshAuth(CRITICAL, { methods: ['otp'] })` is the payoff for
     * carrying `amr` as an array instead of a boolean: a future WebAuthn passkey is `amr: ['hwk']`
     * and a new caller of this option, no guard or route changes.
     */
    methods?: readonly string[];
}

/**
 * Reject with a step-up challenge unless the caller proved themselves within `maxAgeSeconds`,
 * and (when `options.methods` is given) unless every one of those methods is in their `amr`.
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
 * @param options - additional requirements beyond recency — see {@link FreshAuthOptions}
 */
export const requireFreshAuth =
    (maxAgeSeconds: number, options: FreshAuthOptions = {}) =>
    (request: Request, response: Response, next: NextFunction) => {
        // Defensive, not the expected path: a route mounting this without `isAuth` first would
        // otherwise read `undefined.authTime` and throw. Same shape as `requireUnrestricted`'s guard above.
        if (!request.authContext) {
            rejectResponse(response, 401);
            return;
        }

        const ageSeconds = Math.floor(Date.now() / 1000) - request.authContext.authTime;
        const hasRequiredMethods = (options.methods ?? []).every((method) =>
            request.authContext!.amr.includes(method)
        );
        if (ageSeconds <= maxAgeSeconds && hasRequiredMethods) {
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

/**
 * Reject with 403 unless the caller's email is verified. MUST run after `isAuth`.
 *
 * Mounted only where an unverified account is a risk worth refusing over, not on every route — a
 * boilerplate that shipped a verify flow and enforced it nowhere would teach the wrong default,
 * but a browsing, cart-filling, unverified account is a legitimate state. `cart`'s checkout and
 * `payments`' intent/confirm are the two mount points: where this app's money moves, which are
 * also the two `requireFreshAuth(REAUTH_TIME_CRITICAL)` already gates.
 *
 * 403, not 401: the caller IS who their token says, same distinction `requireUnrestricted` draws — this is a
 * permission gap, not an identity one, and `EMAIL_NOT_VERIFIED` is what lets a client route to
 * "check your inbox" instead of a generic denial.
 *
 * @param request - must already carry `authContext`, set upstream by `getAuth`/`isAuth`
 * @param response - answered 401 with no caller at all, 403 for an unverified one
 * @param next - called only once a verified caller is confirmed
 */
export const requireVerified = (request: Request, response: Response, next: NextFunction) => {
    if (!request.authContext) {
        rejectResponse(response, 401);
        return;
    }
    if (!request.authContext.verified) {
        rejectResponse(response, 403, [
            { code: 'EMAIL_NOT_VERIFIED', message: t('generic.error-email-not-verified') }
        ]);
        return;
    }
    next();
};
