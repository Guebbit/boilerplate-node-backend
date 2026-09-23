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
import {
    resolveAccessToken,
    resolveRefreshToken,
    resolveCredential,
    API_KEY_TOKEN_PREFIX
} from '@kernel/authentication';
import { holdsKey } from '@kernel/ability';
import {
    assertDeclared,
    callerFor,
    callerInScope,
    findKey,
    scopeOfKey,
    type StepUpTier
} from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
import { rejectResponse } from '@infrastructure/http/response';
import { callerContextOf } from '@infrastructure/http/request';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { apiKeyLimiter } from '@infrastructure/http/middlewares/rate-limit';
import {
    recordAudit,
    coreAuditActions,
    buildAuditEvent
} from '@infrastructure/observability/audit';

/**
 * The `errors[].code` locale key follows one rule everywhere in this codebase: `FORBIDDEN` reads
 * `generic.error-forbidden`, `EMAIL_NOT_VERIFIED` reads `generic.error-email-not-verified`. One
 * rule for both `requirePermission`'s own default and a key's `deniedCode` override
 * (`kernel/permissions.ts`'s `PermissionKey`), so a new override needs nothing added to
 * `locales/*.json` beyond the matching key.
 */
const errorLocaleKeyFor = (code: string): string =>
    `generic.error-${code.toLowerCase().replaceAll('_', '-')}`;

/**
 * Record a refusal before answering it, so a denied request always leaves a trail.
 *
 * Which route and which method are on every one of them, and are added here rather than at each
 * call site — a refusal nobody can locate is half a record.
 */
const auditRefusal = (
    request: Request,
    fields: Omit<Parameters<typeof buildAuditEvent>[1], 'outcome'>
): void =>
    recordAudit(callerContextOf(request), {
        ...fields,
        outcome: 'failure',
        metadata: { route: request.path, method: request.method, ...fields.metadata }
    });

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
 * Never rejects on the JWT path: an absent or invalid token just leaves `authContext` unset, so
 * this can sit in front of routes that work for both anonymous and authenticated callers —
 * `isAuth`/`requirePermission` are what actually gate a route.
 *
 * The CREDENTIAL path (`sk_...`, resolved by `@modules/api-keys` when present) is the one
 * exception: a credential that resolves but is over its own request budget is refused here, with
 * `apiKeyLimiter`'s 429 — the request never reaches a route only to be refused there instead.
 *
 * @param request - populated with `authContext` (JWT) or `caller`/`credentialId` (credential) on success
 * @param response - unused on the JWT path; answers 429 on the credential path's own rate limit
 * @param next - always called on the JWT path; called by `apiKeyLimiter` on the credential path
 */
export const getAuth = (request: Request, response: Response, next: NextFunction) => {
    // Two modules can share a URL prefix (e.g. `account` and `addresses` both under `/account`),
    // each mounting this guard on its own router. An unmatched request in the first router falls
    // through Express to the second, which would otherwise redo the JWT verify / user read /
    // membership read — and spend a second unit of an `sk_` caller's request budget — for work
    // already done. A caller already resolved (JWT or API key) is left exactly as-is.
    if (request.authContext ?? request.caller) {
        next();
        return;
    }

    const token = getTokenBearer(request);

    if (!token) {
        next();
        return;
    }

    // Checked before any JWT verification is attempted: a JWT is always base64url of `{"alg"`
    // (`eyJ...`), so the two prefixes can never collide, and this skips a wasted parse attempt on
    // an opaque token. See `API_KEY_TOKEN_PREFIX`'s own doc comment.
    if (token.startsWith(API_KEY_TOKEN_PREFIX)) {
        resolveCredential(token)
            .then((resolved) => {
                if (!resolved) {
                    next();
                    return;
                }
                request.caller = resolved.caller;
                request.credentialId = resolved.credentialId;
                apiKeyLimiter(request, response, next);
            })
            .catch(() => next());
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
                    analyticsConsent: user.analyticsConsent
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
 * The 401 both identity guards answer with. Audited before rejecting: a failed auth attempt is
 * exactly what the trail exists to record.
 */
const refuseUnauthenticated = (request: Request, response: Response): void => {
    auditRefusal(request, {
        action: coreAuditActions.SECURITY_UNAUTHORIZED,
        actor_user_id: 'anonymous',
        actor_role: 'anonymous'
    });
    rejectResponse(response, 401);
};

/**
 * Whether `getAuth` (or, for the one SSE route, {@link requirePermissionViaCookie}) resolved a
 * human session with a BEARER token — never true for a cookie alone.
 *
 * Both fields are required, and neither implies the other: {@link requirePermissionViaCookie}
 * writes `authContext` from the refresh COOKIE, for the one route a browser cannot send a header
 * on, with no bearer token on the request at all. A caller carrying only that cookie must read as
 * having no bearer session — or the cookie becomes a second way to hold a session on every route
 * that checks for one, including ones never built to accept it.
 *
 * @param request - read, never mutated
 * @returns whether this request carries a bearer-authenticated session
 */
const hasBearerSession = (request: Request): boolean =>
    request.authContext !== undefined && getTokenBearer(request) !== undefined;

/**
 * Whether `caller` was resolved from an `sk_...` API-key credential rather than a human session.
 *
 * `caller`'s own presence cannot tell the two apart: {@link requirePermissionViaCookie} sets it
 * too, alongside `authContext`. `credentialId` is the one field only the credential branch of
 * `getAuth` ever writes — see its own doc comment in `globals.d.ts`.
 *
 * @param request - read, never mutated
 * @returns whether this request carries a resolved API-key credential
 */
const isCredentialCaller = (request: Request): boolean =>
    request.caller !== undefined && request.credentialId !== undefined;

/**
 * Reject with 401 unless `getAuth` resolved a human SESSION onto the request.
 *
 * Session only, deliberately. An `sk_...` credential resolves to `request.caller` and no
 * `authContext`, so it is refused here — which is the right answer for every route whose subject
 * is the caller themselves. A machine credential has no cart, no sessions and no second factor,
 * and the controllers behind these routes say so in their types: they read
 * `request.authContext!.id`, an assertion that is sound precisely BECAUSE this guard admits
 * nothing else.
 *
 * A route whose subject is the tenant's data rather than the caller mounts
 * {@link isAuthOrCredential} instead.
 *
 * See: docs/tools/security.md#machine-to-machine-credentials
 *
 * @param request - must already carry `authContext`, set upstream by `getAuth`
 * @param response - answered 401 when no bearer-authenticated session was resolved
 * @param next - called only once a session is confirmed present
 */
export const isAuth = (request: Request, response: Response, next: NextFunction) => {
    if (!hasBearerSession(request)) {
        refuseUnauthenticated(request, response);
        return;
    }

    next();
};

/**
 * {@link isAuth} for a route an API KEY may also reach: rejects with 401 unless `getAuth`
 * resolved EITHER a human session (a genuine bearer one, same as {@link isAuth}) or an `sk_...`
 * credential.
 *
 * Why a second guard, where to mount it, and how both halves of that decision are kept honest:
 * see docs/tools/security.md#machine-to-machine-credentials.
 *
 * @param request - must already carry `authContext` or `caller`, set upstream by `getAuth`
 * @param response - answered 401 when neither was resolved
 * @param next - called once either is confirmed present
 */
export const isAuthOrCredential = (request: Request, response: Response, next: NextFunction) => {
    if (!hasBearerSession(request) && !isCredentialCaller(request)) {
        refuseUnauthenticated(request, response);
        return;
    }

    next();
};

/** How many seconds a tier allows since the caller last proved themselves. */
const tierSeconds = (tier: StepUpTier): number =>
    tier === 'critical' ? REAUTH_TIME_CRITICAL : REAUTH_TIME_SENSITIVE;

/**
 * Did this caller prove themselves recently enough for the tier?
 *
 * Reads `authTime`, which is carried from the token's own `auth_time` claim and never derived
 * here. `0` — a token minted before the claim existed — reads as infinitely old, which is the
 * fail-closed direction: a pre-existing session is asked to re-authenticate at its first
 * high-risk action rather than being treated as freshly authenticated.
 */
const provedRecentlyEnough = (request: Request, tier: StepUpTier): boolean =>
    Math.floor(Date.now() / 1000) - (request.authContext?.authTime ?? 0) <= tierSeconds(tier);

/**
 * Answer the step-up challenge — 401, not 403, and the status names the client's next move.
 *
 * Both dialects, as `requireFreshAuth` sends them: `WWW-Authenticate` for anything that speaks
 * OAuth, and this app's own `errors[].code` envelope for its own clients, which read the code and
 * never the header.
 */
const challengeForFreshAuth = (response: Response, maxAgeSeconds: number): void => {
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
 * Reject with 403 unless the resolved caller's role holds `key`. MUST run after `isAuth`.
 *
 * The key is checked against the declared set at MOUNT time, not at request time: a route guarded
 * by a key no module owns would otherwise answer 403 to everyone and look like a permissions
 * problem for as long as nobody tried it.
 *
 * @param key - the permission key this route requires, e.g. `products.any.update`
 * @throws Error at mount time when no module declares the key
 */
export const requirePermission = (key: string) => {
    assertDeclared(key);
    const declared = findKey(key);
    // The one place this guard's own scope is known — everything it audits below states it
    // explicitly, because `buildAuditEvent`'s default (`context.caller.scope`) is always
    // `'tenant'` and would misreport every platform-key refusal as a tenant one.
    const scope = scopeOfKey(key);
    // `FORBIDDEN` unless the key names its own — see `PermissionKey.deniedCode`'s docblock.
    const deniedCode = declared?.deniedCode ?? 'FORBIDDEN';
    const deniedMessageKey = errorLocaleKeyFor(deniedCode);

    // Named, not anonymous: `tests/cross-cutting/write-routes-are-guarded.test.ts` and each
    // module's route sweep identify a guard by its function name, and a factory that returns an
    // arrow makes every mount read as unguarded.
    function requirePermissionGuard(request: Request, response: Response, next: NextFunction) {
        /*
         * No credentials at all — 401, not 403. Unreachable through the current routes, which all
         * mount `isAuth` first; it guards a future mount that forgets. Two paths resolve a
         * caller: `authContext` (a human session) or `caller` alone (an api-key — see `getAuth`'s
         * `sk_...` branch); neither present is genuinely unauthenticated.
         *
         * See: docs/tools/security.md#_401-or-403-and-why-the-guards-agree
         */
        if (!request.authContext && !request.caller) {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_UNAUTHORIZED,
                actor_user_id: 'anonymous',
                actor_role: 'anonymous',
                actor_scope: scope,
                metadata: { reason: 'not_authenticated' }
            });
            rejectResponse(response, 401);
            return;
        }

        /*
         * An api-key is tenant-scoped by construction (docs/tools/security.md#machine-to-machine-credentials)
         * and can never satisfy a platform key. Refused here, distinctly from a missing
         * permission, rather than left to fall through to `holdsKey` for the same 403 — the audit
         * trail should say WHY, not just that the check failed.
         */
        if (!request.authContext && scope === 'platform') {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actor_scope: scope,
                metadata: { reason: 'credential_wrong_scope', permission: key }
            });
            rejectResponse(response, 403);
            return;
        }

        /*
         * The guard asks the ability, not the key list, so a route and a query agree by
         * construction: both read the same rules. It asks about the ACTION and SUBJECT rather
         * than about the row, because a route guard runs before anything is fetched — which is
         * the whole point of keeping the row restriction in the read instead.
         *
         * `authContext` re-derives the caller PER KEY, because a human may hold both a tenant and
         * a platform role and the key being checked is what decides which (`callerFor`'s own
         * docblock). An api-key's caller has no such ambiguity — tenant-scoped only — and is
         * already fixed at credential-resolve time, so it is used as-is.
         *
         * `!` is safe, not a suppression: the two guards above already returned for "neither
         * present" and "no `authContext` and a platform key", so reaching here with no
         * `authContext` guarantees `request.caller` is set — a fact the compiler cannot follow
         * across the two earlier `if`s and their side-effecting calls.
         */
        const caller = request.authContext ? callerFor(request.authContext, key) : request.caller!;
        const allowed = holdsKey(caller, key);

        /*
         * Step-up is asked AFTER the key check, and the order is the argument: telling somebody
         * to re-authenticate for an action they could never take either way hands them a fact
         * about the permission model they had not earned. Refused first, challenged second.
         */
        if (allowed && declared?.stepUp && !provedRecentlyEnough(request, declared.stepUp)) {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_REAUTH_REQUIRED,
                actor_scope: scope,
                metadata: { reason: 'step_up_required', permission: key, tier: declared.stepUp }
            });
            challengeForFreshAuth(response, tierSeconds(declared.stepUp));

            return;
        }

        if (!allowed) {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actor_scope: scope,
                metadata: { reason: 'missing_permission', permission: key }
            });
            rejectResponse(response, 403, [{ code: deniedCode, message: t(deniedMessageKey) }]);
            return;
        }

        next();
    }

    // The key this guard closes over, otherwise invisible once mounted — `tests/support/routes.ts`
    // reads it back so the contract sweep can ask, per route, WHICH roles a 403 is correct for,
    // rather than only whether a guard is present at all.
    return Object.assign(requirePermissionGuard, { permissionKey: key });
};

/**
 * Resolves the refresh cookie's caller and checks `key`, auditing a refusal exactly as
 * {@link requirePermissionViaCookie} answers one — shared by that connect-time guard and by
 * {@link stillHoldsKeyViaCookie}'s periodic recheck of an already-open stream, so the two can never
 * disagree about who holds `key`.
 *
 * Rejects exactly when `resolveRefreshToken` does — a forged or expired token — and leaves that
 * distinct from "resolved to nobody, or resolved but lacks the key" on purpose: the two callers
 * below disagree about what a resolver failure should mean (401 to a connecting client; fail-closed
 * to an already-open stream that cannot be told apart from a revoked one), so only they may decide.
 *
 * @param request - only for the audit trail; never re-authenticated from it
 * @param refreshToken - the `jwt` cookie value
 * @param key - the permission key to check
 * @returns the resolved user when they hold `key`, otherwise `undefined`
 */
const resolveKeyHolderViaCookie = (request: Request, refreshToken: string, key: string) =>
    resolveRefreshToken(refreshToken).then((user) => {
        const allowed = user !== undefined && holdsKey(callerFor(user, key), key);

        if (!allowed) {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actor_user_id: user?.id ?? 'anonymous',
                metadata: { reason: 'missing_permission', permission: key }
            });
        }

        return allowed ? user : undefined;
    });

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

        resolveKeyHolderViaCookie(request, refreshToken, key)
            .then((user) => {
                if (!user) {
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
 * {@link requirePermissionViaCookie}'s check, re-run outside the request lifecycle — for the one
 * stream that connects via that guard and then stays open. Revocation lands on the next request
 * everywhere else in this codebase; a stream has no next request until something closes it, so
 * `streamObservabilityMetrics` calls this every 30 seconds and ends the stream on `false`.
 *
 * Fails closed: a resolver error (an expired token, a datastore outage) answers `false`, the same
 * as a role that no longer holds `key` — indistinguishable from outside, and both mean the stream
 * stops.
 *
 * @param request - the request that opened the stream, kept only for the audit trail
 * @param refreshToken - the `jwt` cookie value captured when the stream connected
 * @param key - the permission key to re-check
 * @returns whether the caller still holds `key`
 */
export const stillHoldsKeyViaCookie = (
    request: Request,
    refreshToken: string,
    key: string
): Promise<boolean> =>
    resolveKeyHolderViaCookie(request, refreshToken, key)
        .then((user) => user !== undefined)
        .catch(() => false);

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
        // otherwise read `undefined.authTime` and throw. Same shape as `requirePermission`'s guard above.
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

        // The module docblock's own promise — "every rejection from the identity guards is
        // audited" — which this direct mount had not kept: `requirePermission`'s OWN step-up path
        // (`declared.stepUp`, above) already audits `SECURITY_REAUTH_REQUIRED`, but a route mounting
        // `requireFreshAuth`/`requireFreshAuthWhen` directly — `cart`, `payments`, `account` itself,
        // per this file's own module doc — challenged with no trail at all.
        auditRefusal(request, {
            action: coreAuditActions.SECURITY_REAUTH_REQUIRED,
            metadata: { reason: 'fresh_auth_required', maxAgeSeconds }
        });
        challengeForFreshAuth(response, maxAgeSeconds);
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
