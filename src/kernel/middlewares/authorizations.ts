/**
 * @module
 * Express guards built on `kernel/authentication.ts`'s resolver: `getAuth` populates
 * `request.authContext` when a token is present, `isAuth` rejects when it is missing,
 * `requirePermission` rejects when the caller's role does not hold a given rule,
 * `requirePermissionViaCookie` is the SSE-only variant that authenticates by session cookie
 * instead of an `Authorization` header (in `cookie` session mode `getAuth` takes the cookie too), and `requireFreshAuth`/`requireFreshAuthWhen` gate an
 * already-authenticated caller on HOW RECENTLY they proved it. Every rejection from the
 * identity guards is audited before the response is sent, so a denied request always leaves a
 * trail.
 *
 * A guard takes an ACTION AND A SUBJECT, never a role name. A role is data a deployment may edit; a rule
 * is code, declared beside the routes that check it, and `assertDeclared` refuses one no module
 * owns — so a typo in a mount is a boot failure rather than a route nobody can reach.
 *
 * See: docs/tools/security.md · docs/theory/authorization.md
 */

import type { Request, Response, NextFunction } from 'express';
import {
    resolveBearer,
    resolveCookie,
    watchCookie,
    clearDeadSessionCookie,
    resolveCredential,
    cookieAuthenticatesRequests,
    API_KEY_TOKEN_PREFIX,
    type Resolution,
    type ResolveMissReason
} from '@kernel/authentication';
import { holds } from '@kernel/ability';
import { bearerOf, readSessionCookie } from '@kernel/cookies';
import {
    assertDeclared,
    callerForSubject,
    callerInScope,
    ruleId,
    staffRoleWithheld,
    type StepUpTier
} from '@kernel/permissions';
import { t } from '@infrastructure/i18n';
import { isInfrastructureError } from '@infrastructure/http/errors';
import { rejectResponse, type ResponseErrorItem } from '@infrastructure/http/response';
import { ERROR_CODES, type ErrorCode } from '@api/error-codes';
import { callerContextOf } from '@infrastructure/http/request';
import { apiKeyLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { requireAllowedOrigin } from '@infrastructure/http/middlewares/origin';
import {
    recordAudit,
    coreAuditActions,
    buildAuditEvent
} from '@infrastructure/observability/audit';
import {
    recordSecurityEvent,
    staleCredentialsTotal,
    type SecurityEventAction
} from '@infrastructure/observability/security-events';
import { reauthWindowSeconds } from '@kernel/config';
import type { AuthContext, ResolveOptions } from '@types';

/**
 * The `errors[].code` locale key follows one rule everywhere in this codebase: `FORBIDDEN` reads
 * `generic.error-forbidden`, `EMAIL_NOT_VERIFIED` reads `generic.error-email-not-verified`. One
 * rule for both `requirePermission`'s own default and a rule's `deniedCode` override
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

/** Which credential family a refused token belonged to — a metric label, and audit metadata. */
type CredentialKind = 'session' | 'api_key';

/**
 * The attack a refusal names, or `undefined` when a customer plausibly holds the credential.
 * A bad signature and a malformed value are forgeries; a revoked `sk_` key is a retired secret
 * still in circulation. An expired or revoked session JWT is only a stale tab.
 */
const securityActionFor = (
    kind: CredentialKind,
    reason: ResolveMissReason
): SecurityEventAction | undefined => {
    if (reason === 'invalid_signature') return coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE;
    if (reason === 'malformed') return coreAuditActions.SECURITY_TOKEN_MALFORMED;
    if (reason === 'revoked' && kind === 'api_key')
        return coreAuditActions.SECURITY_API_KEY_REVOKED;
    return undefined;
};

/**
 * Count, and where it names an attack audit, a credential the resolver refused.
 *
 * @param request - the refused request, for the audit trail
 * @param kind - which credential family was presented
 * @param reason - why the resolver refused it
 */
const noteMiss = (request: Request, kind: CredentialKind, reason: ResolveMissReason): void => {
    const action = securityActionFor(kind, reason);
    if (!action) {
        staleCredentialsTotal.inc({ kind, reason });
        return;
    }
    recordSecurityEvent(callerContextOf(request), action, {
        kind,
        route: request.path,
        method: request.method
    });
};

/**
 * `getAuth`'s shared `.catch()`: an infrastructure failure goes to the global error handler as a
 * 503, anything else (an invalid or expired token) proceeds anonymous —
 * see `getAuth`'s own docblock for why the two must not be told apart the same way.
 *
 * @param next - called once, with the error only when it is an infrastructure failure
 * @param error - whatever the resolver's promise rejected with
 */
const continueOrFailInfra = (next: NextFunction, error: unknown): void => {
    if (isInfrastructureError(error)) {
        next(error);
        return;
    }
    next();
};

/**
 * Pull the bearer token out of the `Authorization` header, if any.
 *
 * @param request - the incoming request
 * @returns the token, or `undefined` when the header is absent or does not use the `Bearer` scheme
 */
export const getTokenBearer = (request: Request) => bearerOf(request.header('Authorization'));

/**
 * Put a resolved caller on the request, and say how it was authenticated.
 *
 * @param request - populated with `authContext`, `caller` and `sessionVia`
 * @param user - what the resolver answered
 * @param via - which credential carried the session: the header, or the cookie
 */
const applySession = (
    request: Request,
    user: NonNullable<Request['authContext']>,
    via: 'bearer' | 'cookie'
): void => {
    request.authContext = {
        id: user.id,
        email: user.email,
        username: user.username,
        roles: user.roles,
        tenantId: user.tenantId,
        imageUrl: user.imageUrl,
        authTime: user.authTime,
        amr: user.amr,
        twoFactorArmed: user.twoFactorArmed,
        authenticatorArmed: user.authenticatorArmed,
        verified: user.verified,
        analyticsConsent: user.analyticsConsent
    };
    request.sessionVia = via;
    // Resolved once, here, so nothing below turns two role names into keys again.
    request.caller = callerInScope(request.authContext, 'tenant');
};

/**
 * What this request tells the resolver beyond its credential: a client marks a poll or a
 * keep-alive `X-Session-Passive: true` so it is not counted as the person acting. The header can
 * only ever make a session look MORE idle, so there is nothing to forge.
 */
const resolveOptionsOf = (request: Request): ResolveOptions => ({
    passive: request.header('X-Session-Passive') === 'true'
});

/**
 * Resolve a session credential, then continue. The miss, the "nobody" and the outage are told
 * apart exactly as the port documents.
 *
 * @param request - populated on success
 * @param next - called once, with the error only for an infrastructure failure
 * @param resolution - the resolver's promise for the presented credential
 * @param via - which credential carried it
 * @param onMiss - runs when the credential was refused, after the miss is counted
 */
const continueWithSession = (
    request: Request,
    next: NextFunction,
    resolution: ReturnType<typeof resolveBearer>,
    via: 'bearer' | 'cookie',
    onMiss?: () => void
): void => {
    resolution
        .then((resolved) => {
            if ('miss' in resolved) {
                noteMiss(request, 'session', resolved.miss);
                // The 401 that follows tells this person their session ended for inactivity.
                if (resolved.miss === 'idle') request.sessionIdle = true;
                onMiss?.();
            }
            const user = 'ok' in resolved ? resolved.ok : undefined;
            if (user) applySession(request, user, via);
            next();
        })
        .catch((error: unknown) => {
            continueOrFailInfra(next, error);
        });
};

/**
 * The cookie path of {@link getAuth}: with no `Authorization` header, a deployment whose session
 * lives in a cookie resolves the caller from it, on every route.
 *
 * A cookie rides along on a request the user never meant to make, so an UNSAFE method that a
 * cookie would authenticate must name an allowed `Origin` first (the CSRF check, on top of
 * `SameSite=Lax`). The check sits here, in the one place any route's caller is resolved, so no
 * route can be added that a cookie reaches and the check does not.
 *
 * @param request - populated when the cookie names a live session
 * @param response - answered 403 when an unsafe request names a foreign origin
 * @param next - called once, with the error only for an infrastructure failure
 */
const continueWithCookie = (request: Request, response: Response, next: NextFunction): void => {
    const cookieToken = cookieAuthenticatesRequests() ? readSessionCookie(request) : undefined;
    if (!cookieToken) {
        next();
        return;
    }

    const resolveFromCookie = (): void => {
        // A cookie the resolver refuses can never work again (another mode's, revoked from
        // another device, expired): clearing it saves the lookup on every request after this one.
        continueWithSession(
            request,
            next,
            resolveCookie(cookieToken, resolveOptionsOf(request)),
            'cookie',
            () => {
                clearDeadSessionCookie(response);
            }
        );
    };

    if (SAFE_METHODS.has(request.method)) resolveFromCookie();
    else requireAllowedOrigin(request, response, resolveFromCookie);
};

/** Methods that change nothing, so a cookie riding along on one needs no origin check. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Resolve `request.authContext` from a session credential when one is present, then continue. This
 * sits in front of routes that work for both anonymous and authenticated callers.
 *
 * Credential: `Authorization: Bearer` first — an access token or a `ses_…` session id. With no
 *             header, the session cookie, in a deployment whose sessions live in one.
 * No caller:  an absent, invalid or expired token, or one naming a user who no longer exists,
 *             leaves `authContext` unset — `isAuth`/`requirePermission` are what gate a route.
 * Outage:     a resolver failure meaning Mongo/Redis was unreachable goes to `next(error)`, so the
 *             global handler answers 503, never "your credentials are wrong" (RFC 9110 §15.5.2;
 *             see `infrastructure/http/errors.ts#isInfrastructureError`).
 * Credential: `sk_...` (resolved by `@modules/api-keys` when present) gets the same treatment,
 *             plus `apiKeyLimiter`'s 429 for one over its own request budget — refused here, not
 *             at the route.
 *
 * @param request - populated with `authContext` (a session) or `caller`/`credentialId` (credential) on success
 * @param response - answers 429 on the credential path's own rate limit, 403 on a cookie-authenticated
 *   unsafe request from a foreign origin
 * @param next - called once on every path but a refused request — with the error for an
 *   infrastructure failure, otherwise with none
 */
export const getAuth = (request: Request, response: Response, next: NextFunction) => {
    // Two modules can share a URL prefix (e.g. `account` and `addresses` both under `/account`),
    // each mounting this guard on its own router. An unmatched request in the first router falls
    // through Express to the second, which would otherwise redo the verify / user read /
    // membership read — and spend a second unit of an `sk_` caller's request budget — for work
    // already done. A caller already resolved (session or API key) is left exactly as-is.
    if (request.authContext ?? request.caller) {
        next();
        return;
    }

    const token = getTokenBearer(request);

    if (!token) {
        continueWithCookie(request, response, next);
        return;
    }

    // Checked before any session resolution is attempted: a JWT is always base64url of `{"alg"`
    // (`eyJ...`), so the prefixes can never collide, and this skips a wasted parse attempt on an
    // opaque token. See `API_KEY_TOKEN_PREFIX`'s own doc comment.
    if (token.startsWith(API_KEY_TOKEN_PREFIX)) {
        resolveCredential(token)
            .then((resolution) => {
                if ('miss' in resolution) {
                    noteMiss(request, 'api_key', resolution.miss);
                    next();
                    return;
                }
                request.caller = resolution.ok.caller;
                request.credentialId = resolution.ok.credentialId;
                apiKeyLimiter(request, response, next);
            })
            .catch((error: unknown) => {
                continueOrFailInfra(next, error);
            });
        return;
    }

    continueWithSession(request, next, resolveBearer(token, resolveOptionsOf(request)), 'bearer');
};

/**
 * The 401 both identity guards answer with. Audited before rejecting: a failed auth attempt is
 * exactly what the trail exists to record.
 */
const refuseUnauthenticated = (
    request: Request,
    response: Response,
    errors: ResponseErrorItem[] = []
): void => {
    auditRefusal(request, {
        action: coreAuditActions.SECURITY_UNAUTHORIZED,
        actorUserId: 'anonymous',
        actorRole: 'anonymous',
        ...(request.sessionIdle && { metadata: { reason: 'session_idle' } })
    });
    rejectResponse(
        response,
        401,
        request.sessionIdle && errors.length === 0
            ? [{ code: ERROR_CODES.SESSION_IDLE, message: t('account.session-idle') }]
            : errors
    );
};

/** The 401 body the cookie guard has always answered with. */
const cookieUnauthorizedErrors = (): ResponseErrorItem[] => [
    { code: 'UNAUTHORIZED', message: t('generic.error-unauthorized') }
];

/**
 * Whether `getAuth` resolved a human SESSION — by bearer header, or by cookie in a deployment whose
 * sessions live in one.
 *
 * `sessionVia` is what says so, and `authContext` alone does not: {@link requirePermissionViaCookie}
 * writes `authContext` from the session cookie for the one route a browser cannot send a header
 * on. In `jwt` mode that cookie must not become a second way to hold a session on every route that
 * checks for one, including ones never built to accept it — so the flag is set only by `getAuth`,
 * and only for a credential the deployment accepts on ordinary routes.
 *
 * @param request - read, never mutated
 * @returns whether this request carries a session `getAuth` accepted
 */
const hasSession = (request: Request): boolean =>
    request.authContext !== undefined && request.sessionVia !== undefined;

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
    if (!hasSession(request)) {
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
    if (!hasSession(request) && !isCredentialCaller(request)) {
        refuseUnauthenticated(request, response);
        return;
    }

    next();
};

/**
 * Did this caller prove themselves recently enough for the tier?
 *
 * Reads `authTime`, which is carried from the token's own `auth_time` claim and never derived
 * here. `0` — a token minted before the claim existed — reads as infinitely old, which is the
 * fail-closed direction: a pre-existing session is asked to re-authenticate at its first
 * high-risk action rather than being treated as freshly authenticated.
 */
const provedRecentlyEnough = (request: Request, tier: StepUpTier): boolean =>
    Math.floor(Date.now() / 1000) - (request.authContext?.authTime ?? 0) <=
    reauthWindowSeconds(tier);

/**
 * Answer the step-up challenge — 401, not 403, and the status names the client's next move.
 *
 * Both dialects, as `requireFreshAuth` sends them: `WWW-Authenticate` for anything that speaks
 * OAuth, and this app's own `errors[].code` envelope for its own clients, which read the code and
 * never the header.
 */
const challengeForFreshAuth = (
    response: Response,
    maxAgeSeconds: number,
    methods: readonly string[] = []
): void => {
    response.setHeader(
        'WWW-Authenticate',
        `Bearer error="insufficient_user_authentication", max_age=${maxAgeSeconds}`
    );
    rejectResponse(response, 401, [
        {
            code: ERROR_CODES.REAUTH_REQUIRED,
            message: t('generic.error-reauth-required'),
            // `methods` names what the re-authentication must PROVE beyond recency (RFC 9470 asks
            // the same of `acr_values`); absent when the route asks for nothing but a fresh login.
            details: { maxAge: maxAgeSeconds, ...(methods.length > 0 && { methods }) }
        }
    ]);
};

/**
 * Would this session hold the rule if its authenticator app were armed — what tells "enrol to use
 * your staff tools" from a plain refusal. Asked only after the rule check failed, and only of a
 * session whose staff role is withheld, so it hands a person nothing they had not earned.
 *
 * @param context - the resolved session
 * @param action - the action the guard asks for
 * @param subject - the subject it asks about
 */
const wouldHoldOnceEnrolled = (context: AuthContext, action: string, subject: string): boolean =>
    staffRoleWithheld(context) &&
    holds(callerForSubject({ ...context, authenticatorArmed: true }, subject), action, subject);

/**
 * Reject with 403 unless the resolved caller holds a rule for `action` on `subject`. MUST run
 * after `isAuth`.
 *
 * The rule is checked against the declared set at MOUNT time, not at request time: a route
 * guarded by a rule no module owns would otherwise answer 403 to everyone and look like a
 * permissions problem for as long as nobody tried it.
 *
 * @param action - the action this route requires, e.g. `display`. A STAFF door asks the staff
 *   action (`display`, `admin`), never the plain one: every signed-in account holds `read:Payment`,
 *   and that must not open `display:Payment`'s staff list.
 * @param subject - the CASL subject the action is taken on, e.g. `Payment`
 * @throws Error at mount time when no module declares a rule for the pair
 */
export const requirePermission = (action: string, subject: string) => {
    const declared = assertDeclared(action, subject);
    const permission = ruleId(action, subject);
    // The one place this guard's own scope is known — everything it audits below states it
    // explicitly, because `buildAuditEvent`'s default (`context.caller.scope`) is always
    // `'tenant'` and would misreport every platform-rule refusal as a tenant one.
    const { scope } = declared;
    // `FORBIDDEN` unless the rule names its own — see `PermissionRule.deniedCode`'s docblock.
    // `deniedCode` is a plain `string` on `PermissionRule` (not `ErrorCode`) so that
    // `kernel/permissions.ts` never needs the generated catalogue at boot; the cast is safe
    // because `tests/cross-cutting/authorization-keys.test.ts` proves every declared `deniedCode`
    // is a real one.
    const deniedCode = (declared.deniedCode as ErrorCode | undefined) ?? ERROR_CODES.FORBIDDEN;
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
                actorUserId: 'anonymous',
                actorRole: 'anonymous',
                actorScope: scope,
                metadata: { reason: 'not_authenticated' }
            });
            rejectResponse(response, 401);
            return;
        }

        /*
         * An api-key is tenant-scoped by construction (docs/tools/security.md#machine-to-machine-credentials)
         * and can never satisfy a platform rule. Refused here, distinctly from a missing
         * permission, rather than left to fall through to `holds` for the same 403 — the audit
         * trail should say WHY, not just that the check failed.
         */
        if (!request.authContext && scope === 'platform') {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actorScope: scope,
                metadata: { reason: 'credential_wrong_scope', permission }
            });
            rejectResponse(response, 403);
            return;
        }

        /*
         * The guard asks the rules, so a route and a query agree by construction: both read the
         * same ones. It asks about the ACTION and SUBJECT rather than about the row, because a
         * route guard runs before anything is fetched — which is the whole point of keeping the
         * row restriction in the read instead.
         *
         * `authContext` re-derives the caller PER SUBJECT, because a human may hold both a tenant
         * and a platform role and the subject being checked is what decides which
         * (`callerForSubject`'s own docblock). An api-key's caller has no such ambiguity — tenant-scoped only — and is
         * already fixed at credential-resolve time, so it is used as-is.
         *
         * `!` is safe, not a suppression: the two guards above already returned for "neither
         * present" and "no `authContext` and a platform rule", so reaching here with no
         * `authContext` guarantees `request.caller` is set — a fact the compiler cannot follow
         * across the two earlier `if`s and their side-effecting calls.
         */
        const caller = request.authContext
            ? callerForSubject(request.authContext, subject)
            : request.caller!;
        const allowed = holds(caller, action, subject);

        /*
         * Step-up is asked AFTER the rule check, and the order is the argument: telling somebody
         * to re-authenticate for an action they could never take either way hands them a fact
         * about the permission model they had not earned. Refused first, challenged second.
         */
        if (allowed && declared.stepUp && !provedRecentlyEnough(request, declared.stepUp)) {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_REAUTH_REQUIRED,
                actorScope: scope,
                metadata: { reason: 'step_up_required', permission, tier: declared.stepUp }
            });
            challengeForFreshAuth(response, reauthWindowSeconds(declared.stepUp));

            return;
        }

        // A staff role switched off for want of an authenticator app: say so, so the client can
        // send the person to enrol instead of showing a bare refusal.
        if (
            !allowed &&
            request.authContext &&
            wouldHoldOnceEnrolled(request.authContext, action, subject)
        ) {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actorScope: scope,
                metadata: { reason: 'second_factor_enrollment_required', permission }
            });
            rejectResponse(response, 403, [
                {
                    code: ERROR_CODES.SECOND_FACTOR_ENROLLMENT_REQUIRED,
                    message: t(errorLocaleKeyFor(ERROR_CODES.SECOND_FACTOR_ENROLLMENT_REQUIRED))
                }
            ]);
            return;
        }

        if (!allowed) {
            auditRefusal(request, {
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actorScope: scope,
                metadata: { reason: 'missing_permission', permission }
            });
            rejectResponse(response, 403, [{ code: deniedCode, message: t(deniedMessageKey) }]);
            return;
        }

        next();
    }

    // The rule this guard closes over, otherwise invisible once mounted — `tests/support/routes.ts`
    // reads it back so the contract sweep can ask, per route, WHICH roles a 403 is correct for,
    // rather than only whether a guard is present at all.
    return Object.assign(requirePermissionGuard, { permission: { action, subject } });
};

/**
 * Judges a resolved cookie against a rule, auditing a refusal exactly as {@link requirePermissionViaCookie}
 * answers one — shared by that connect-time guard and by {@link stillHoldsRuleViaCookie}'s periodic
 * recheck of an already-open stream, so the two can never disagree about who holds the rule.
 *
 * Throws when the credential is refused (forged, expired, revoked), and leaves that distinct from
 * "resolved to nobody, or resolved but lacks the rule" on purpose: the two callers below disagree
 * about what a refusal should mean (401 to a connecting client; fail-closed to an already-open
 * stream that cannot be told apart from a revoked one), so only they may decide.
 *
 * @param request - only for the audit trail; never re-authenticated from it
 * @param resolution - what the session cookie resolved to
 * @param action - the action to check
 * @param subject - the subject it is asked about
 * @returns the resolved user when they hold the rule, otherwise `undefined`
 * @throws {Error} when the credential itself was refused
 */
const judgeRuleHolder = (
    request: Request,
    resolution: Resolution<AuthContext | undefined>,
    action: string,
    subject: string
) => {
    if ('miss' in resolution) {
        noteMiss(request, 'session', resolution.miss);
        throw new Error(`Session cookie refused: ${resolution.miss}`);
    }
    const user = resolution.ok;
    const allowed = user !== undefined && holds(callerForSubject(user, subject), action, subject);

    if (!allowed) {
        auditRefusal(request, {
            action: coreAuditActions.SECURITY_FORBIDDEN,
            actorUserId: user?.id ?? 'anonymous',
            metadata: { reason: 'missing_permission', permission: ruleId(action, subject) }
        });
    }

    return allowed ? user : undefined;
};

/**
 * {@link requirePermission} for endpoints a BROWSER opens without being able to set a header —
 * SSE, via `EventSource`, which cannot send `Authorization`. The session cookie is the credential,
 * verified as the deployment verifies a session anywhere else: a revoked one is rejected rather
 * than merely an expired one.
 *
 * Leaves the stream's recheck on `request.sessionRecheck`, bound to the session FAMILY rather than
 * to this cookie's value, which the next rotation supersedes.
 *
 * See: docs/tools/security.md#why-the-sse-endpoints-authenticate-by-cookie
 *
 * @param action - the action this route requires
 * @param subject - the subject it is taken on
 * @throws Error at mount time when no module declares the rule
 */
export const requirePermissionViaCookie = (action: string, subject: string) => {
    assertDeclared(action, subject);

    // Named for the same reason as `requirePermissionGuard` above.
    return function requirePermissionViaCookieGuard(
        request: Request,
        response: Response,
        next: NextFunction
    ) {
        const sessionToken = readSessionCookie(request);

        // No cookie is 401 (who are you); a valid cookie without the key is 403 (not you).
        if (!sessionToken) {
            refuseUnauthenticated(request, response, cookieUnauthorizedErrors());
            return;
        }

        watchCookie(sessionToken)
            .then((watch) => {
                const user = judgeRuleHolder(
                    request,
                    'miss' in watch ? watch : { ok: watch.ok.context },
                    action,
                    subject
                );
                if (!user || 'miss' in watch) {
                    rejectResponse(response, 403, [t('generic.error-forbidden')]);
                    return;
                }

                request.authContext = user;
                request.caller = callerInScope(user, 'tenant');
                request.sessionRecheck = watch.ok.recheck;
                next();
            })
            .catch(() => {
                refuseUnauthenticated(request, response, cookieUnauthorizedErrors());
            });
    };
};

/**
 * {@link requirePermissionViaCookie}'s check, re-run outside the request lifecycle — for the
 * streams that connect via that guard and then stay open. Revocation lands on the next request
 * everywhere else in this codebase; a stream has no next request until something closes it, so
 * the stream calls this every 30 seconds and ends on `false`.
 *
 * Fails closed: a resolver error (a revoked family, a datastore outage) answers `false`, the same
 * as a role that no longer holds the rule — indistinguishable from outside, and both mean the stream
 * stops. A request the guard never admitted has nothing to recheck, which is the same answer.
 *
 * @param request - the request that opened the stream, carrying the guard's recheck
 * @param action - the action to re-check
 * @param subject - the subject it is asked about
 * @returns whether the caller still holds the rule
 */
export const stillHoldsRuleViaCookie = (
    request: Request,
    action: string,
    subject: string
): Promise<boolean> =>
    Promise.resolve()
        .then(() => request.sessionRecheck?.() ?? { miss: 'revoked' as const })
        .then((resolution) => judgeRuleHolder(request, resolution, action, subject) !== undefined)
        .catch(() => false);

/** What {@link requireFreshAuth} may additionally demand, beyond how recently. */
export interface FreshAuthOptions {
    /**
     * Every one of these RFC 8176 values must appear in `authContext.amr` — fresh AND
     * second-factored. `requireFreshAuth('critical', { methods: ['otp'] })` is the payoff for
     * carrying `amr` as an array instead of a boolean: a future WebAuthn passkey is `amr: ['hwk']`
     * and a new caller of this option, no guard or route changes.
     */
    methods?: readonly string[];
}

/**
 * Reject with a step-up challenge unless the caller proved themselves within the tier's window,
 * and (when `options.methods` is given) unless every one of those methods is in their `amr`.
 * MUST run after `isAuth`.
 *
 * **401, not 403** — this repository's own rule (docs/tools/security.md), not just RFC 9470's:
 * the status names the client's next move, and 401 means "authenticate and try again", which is
 * the literal definition of step-up. The rejection carries both dialects: `WWW-Authenticate` for
 * anything that speaks OAuth, this app's own `errors[].code` envelope for its own clients, which
 * read `errors[].code` and never the header.
 *
 * @param tier - how recently `authContext.authTime` must have been set; the seconds are read
 *   per request from `NODE_REAUTH_TIME_<TIER>`, never frozen when the router loads
 * @param options - additional requirements beyond recency — see {@link FreshAuthOptions}
 */
export const requireFreshAuth =
    (tier: StepUpTier, options: FreshAuthOptions = {}) =>
    (request: Request, response: Response, next: NextFunction) => {
        const maxAgeSeconds = reauthWindowSeconds(tier);

        // No session to age. An API key can never step up (nobody types a password into a key), so
        // it is refused as forbidden, not challenged: a 401 here would tell it to authenticate
        // again, which it cannot do. With no caller at all a route mounted this guard without
        // `isAuth` first, so it answers like any other unauthenticated request.
        if (!request.authContext) {
            if (isCredentialCaller(request)) {
                auditRefusal(request, {
                    action: coreAuditActions.SECURITY_FORBIDDEN,
                    metadata: { reason: 'credential_cannot_step_up', tier }
                });
                rejectResponse(response, 403, [
                    {
                        code: ERROR_CODES.FORBIDDEN,
                        message: t(errorLocaleKeyFor(ERROR_CODES.FORBIDDEN))
                    }
                ]);
                return;
            }
            refuseUnauthenticated(request, response, cookieUnauthorizedErrors());
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
            metadata: { reason: 'fresh_auth_required', tier, maxAgeSeconds }
        });
        challengeForFreshAuth(response, maxAgeSeconds, options.methods);
    };

/**
 * `requireFreshAuth`, but only when `predicate` says this particular request needs it — for a
 * route where freshness depends on WHAT changed, not just who's asking. `PUT /account` is why
 * this exists: it only needs a fresh session when the email is changing, and an unconditional
 * gate would prompt for a password on every avatar upload — a prompt people learn to dismiss is a
 * prompt that protects nothing.
 *
 * **Mount order matters when `predicate` reads `request.body`.** `PUT /account` accepts
 * `multipart/form-data`, so `request.body` does not exist until `upload.image()` has run — a
 * predicate guard mounted before it reads an empty object and gates nothing. Mount this AFTER
 * whatever populates the body the predicate reads.
 *
 * @param predicate - reads the request and decides whether THIS one needs a fresh session; it may
 *   answer later, and a rejection reaches the error handler
 * @param tier - passed through to {@link requireFreshAuth} when the predicate is true
 * @param options - passed through too: what the fresh session must additionally have proved
 */
export const requireFreshAuthWhen =
    (
        predicate: (request: Request) => boolean | Promise<boolean>,
        tier: StepUpTier,
        options: FreshAuthOptions = {}
    ) =>
    (request: Request, response: Response, next: NextFunction) => {
        const dispatch = (needsFreshAuth: boolean): void => {
            if (needsFreshAuth) requireFreshAuth(tier, options)(request, response, next);
            else next();
        };

        // A predicate may need a read ("is this role actually changing?"), so it may answer later.
        const answer = predicate(request);
        if (typeof answer === 'boolean') dispatch(answer);
        else answer.then(dispatch).catch(next);
    };
