/**
 * Authorization middlewares — `src/kernel/middlewares/authorizations.ts`.
 *
 * Three middlewares with deliberately different failure modes, and the difference is the point:
 *
 *   `getAuth`  — *optional* identification. Fails open by design: a bad token means "anonymous",
 *                not "rejected", because it also guards public routes. It must always call
 *                `next()` exactly once, on every path, or the request hangs.
 *   `isAuth`   — *required* identification. Fails closed with 401.
 *   `requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)`  — *required* elevation. Fails closed, and the status says which check refused:
 *                401 with no credentials at all (as `isAuth` does), 403 for a caller without the key.
 *                Both bodies stay generic; the reason is recorded in the audit trail only.
 *
 * The response layer is real (not mocked) so the asserted status codes are the ones a client
 * actually receives; only the audit sink and the JWT/DB boundaries are stubbed.
 */

import { asStub } from '@tests/stub';
import type { Request, Response, NextFunction } from 'express';
import {
    getTokenBearer,
    getAuth,
    isAuth,
    isAuthOrCredential,
    requirePermission,
    requirePermissionViaCookie,
    stillHoldsRuleViaCookie,
    requireFreshAuth,
    requireFreshAuthWhen
} from '@kernel/middlewares/authorizations';
import { registerAuthResolver, registerCredentialResolver } from '@kernel/authentication';
import { emitAuditEvent, coreAuditActions } from '@infrastructure/observability/audit';
import {
    securityEventsTotal,
    staleCredentialsTotal
} from '@infrastructure/observability/security-events';
import { makeResponseStub } from '@tests/express';
import { asCustomer, asAdmin } from '../../support/callers';
import { callerInScope } from '@kernel/permissions';
import type { AuthContext, Caller } from '@types';

// Only the sink is replaced; `buildAuditEvent` and the `coreAuditActions` vocabulary stay real, so an
// event that stops matching the real builder's shape fails here rather than in production.
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        ...actual,
        emitAuditEvent,
        // `auditRefusal` (`kernel/middlewares/authorizations.ts`) calls `recordAudit`, which
        // closes over its own module's real `emitAuditEvent` — immune to the override above.
        // Reroute it through the replacement so this mocked `emitAuditEvent` still sees it.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

/*
 * The guards do not look a user up themselves — they ask `kernel/authentication` for one, and
 * `account` supplies the implementation at boot. So the fake here is the RESOLVER, which is also
 * the whole contract these guards depend on:
 *
 *   - resolving `{ miss }` means the token is bad;
 *   - resolving `{ ok: undefined }` means the token was fine but names nobody;
 *   - a rejection is an outage.
 *
 * `requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)` turns the first into 401 and the second into 403, so the two must stay
 * distinguishable in the fake exactly as they are in production.
 */
/**
 * A key only `admin` holds — stands in for "the elevated permission" throughout this file, named
 * explicitly rather than through any scope-wide shortcut, since none exists.
 */
const [ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT] = ['delete', 'ApiKey'] as const;

/**
 * Runs the staff payments guard for one caller.
 * @param authContext - who is asking
 */
const runPaymentsStaffGuard = (authContext: AuthContext) => {
    const next = jest.fn();
    const response = makeResponseStub();
    requirePermission('display', 'Payment')(makeRequest({ authContext }), response, next);
    return { next, response };
};

const fromAccessToken = jest.fn<Promise<unknown>, [string]>();
const fromRefreshToken = jest.fn<Promise<unknown>, [string]>();
/** What a stream's family recheck answers, standing in for the strategy's live-family check. */
const recheckFamily = jest.fn<Promise<unknown>, []>();
/** What the resolver is told to do with a cookie it refused. */
const clearDeadCookie = jest.fn();
/** Whether the session cookie authenticates ordinary routes — `cookie` mode's switch. */
let cookieAuthenticates = false;
registerAuthResolver({
    fromBearer: (token) => fromAccessToken(token) as never,
    fromCookie: (token) => fromRefreshToken(token) as never,
    watchCookie: (token) =>
        fromRefreshToken(token).then((resolution) =>
            'miss' in (resolution as object)
                ? (resolution as never)
                : ({
                      ok: {
                          context: (resolution as { ok: AuthContext | undefined }).ok,
                          recheck: () => recheckFamily() as never
                      }
                  } as never)
        ),
    cookieAuthenticates: () => cookieAuthenticates,
    clearDeadCookie
});

/** Fakes `@modules/api-keys`' own resolver, for `getAuth`'s `sk_...` branch. */
const fromBearerToken = jest.fn<Promise<unknown>, [string]>();
registerCredentialResolver({
    fromBearerToken: (token) => fromBearerToken(token) as never
});

const mockedVerifyAccessToken = fromAccessToken;
const mockedVerifyRefreshToken = fromRefreshToken;
const mockedResolveCredential = fromBearerToken;
const mockedEmitAuditEvent = emitAuditEvent as jest.MockedFunction<typeof emitAuditEvent>;

/** Request stub carrying an optional Authorization header and auth context. */
const makeRequest = (options: { authorization?: string; authContext?: AuthContext } = {}) =>
    asStub<Request>({
        header: jest.fn((name: string) =>
            name === 'Authorization' ? options.authorization : undefined
        ),
        authContext: options.authContext,
        // `getAuth` says how the session was carried; here, only a bearer header ever does.
        sessionVia: options.authContext && options.authorization ? 'bearer' : undefined,
        // Both, because `getAuth` sets both: a stub carrying only the session would let a guard
        // pass a test while attributing every denial in the trail to nobody.
        caller: options.authContext && callerInScope(options.authContext, 'tenant'),
        path: '/protected',
        method: 'GET',
        headers: {}
    });

/** Request stub carrying a refresh cookie, for the cookie-authenticated middleware. */
const makeCookieRequest = (jwt?: string) =>
    asStub<Request>({
        cookies: jwt === undefined ? {} : { '__Host-session': jwt },
        header: jest.fn(),
        path: '/orders/1/invoice',
        method: 'GET',
        headers: {}
    });

/**
 * Request stub carrying a resolved `sk_...` API-key credential — `getAuth`'s credential branch's
 * own shape: `caller` and `credentialId` together, `authContext` never set.
 */
const makeCredentialRequest = () =>
    asStub<Request>({
        header: jest.fn(() => undefined),
        caller: asStub<Caller>({}),
        credentialId: 'cred-1',
        path: '/protected',
        method: 'GET',
        headers: {}
    });

/** `makeResponseStub` doesn't stub `setHeader` — the one extra call `requireFreshAuth` makes. */
const makeStepUpResponseStub = () =>
    asStub<Response & { status: jest.Mock; json: jest.Mock; setHeader: jest.Mock }>({
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn()
    });

/** `authTime` as `requireFreshAuth` reads it: epoch SECONDS, matching the JWT `auth_time` claim. */
const nowSeconds = () => Math.floor(Date.now() / 1000);

/** A request whose session authenticated well outside any tier's window. */
const staleRequest = () =>
    makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() - 999 } });

/** Response stub with a chainable status().json(), capturing the real envelope. */

/** Runs an async middleware and resolves once it has called `next()`. */
const runUntilNext = async (
    middleware: (request: Request, response: Response, next: NextFunction) => void,
    request: Request,
    response: Response
) => {
    const next = jest.fn();
    const called = new Promise<void>((resolve) => {
        next.mockImplementation(() => resolve());
    });
    middleware(request, response, asStub<NextFunction>(next));
    await called;
    return next;
};

/**
 * Runs `getAuth` on an `sk_` token that does not resolve, until it answers: a refused key ends the
 * request with a 401 instead of calling `next`.
 */
const runUntilRefused = async (request: Request) => {
    const response = makeResponseStub();
    const setHeader = jest.fn();
    const refused = new Promise<void>((resolve) => {
        response.json.mockImplementation(() => {
            resolve();
            return response;
        });
    });
    getAuth(request, Object.assign(response, { setHeader }), jest.fn());
    await refused;
    return { response, setHeader };
};

describe('getTokenBearer', () => {
    it('strips the Bearer prefix and returns the token', () => {
        expect(getTokenBearer(makeRequest({ authorization: 'Bearer abc.def.ghi' }))).toBe(
            'abc.def.ghi'
        );
    });

    it('returns undefined when the header is absent', () => {
        expect(getTokenBearer(makeRequest())).toBeUndefined();
    });

    it('returns undefined when the header has a scheme but no token', () => {
        expect(getTokenBearer(makeRequest({ authorization: 'Bearer' }))).toBeUndefined();
    });

    it('accepts the scheme word in any case', () => {
        expect(getTokenBearer(makeRequest({ authorization: 'bEaReR abc' }))).toBe('abc');
    });

    it.each(['Basic abc', 'Foo abc', 'abc', 'Bearer a b'])(
        'refuses %j: another scheme, or no scheme word',
        (authorization) => {
            expect(getTokenBearer(makeRequest({ authorization }))).toBeUndefined();
        }
    );
});

describe('getAuth', () => {
    it('calls next without an auth context when no token is present', async () => {
        const request = makeRequest();

        const next = await runUntilNext(getAuth, request, makeResponseStub());

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.authContext).toBeUndefined();
        // The JWT boundary must not even be reached — verifying an absent token would be work
        // done to produce a guaranteed failure.
        expect(mockedVerifyAccessToken).not.toHaveBeenCalled();
    });

    it('attaches the identity of the user the token names', async () => {
        const resolved = { ...asAdmin('user-1'), username: 'tester', imageUrl: '/images/a.png' };
        mockedVerifyAccessToken.mockResolvedValue({ ok: resolved });

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(request.authContext).toEqual(resolved);
        // The caller is resolved alongside the session, in the shop: everything downstream reads
        // keys, and turning two role names into keys twice is how the two answers drift.
        expect(request.caller).toEqual(callerInScope(resolved, 'tenant'));
    });

    it('proceeds anonymously when the token is invalid or expired', async () => {
        // Fails open on purpose: this middleware also runs on public routes, where a stale token
        // in a browser must not turn a public page into an error.
        mockedVerifyAccessToken.mockResolvedValue({ miss: 'expired' });

        const request = makeRequest({ authorization: 'Bearer expired.token' });
        const next = await runUntilNext(getAuth, request, makeResponseStub());

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.authContext).toBeUndefined();
    });

    it('proceeds anonymously when the token is valid but the user no longer exists', async () => {
        // A deleted account holding a still-valid JWT must not be granted an identity.
        mockedVerifyAccessToken.mockResolvedValue({ ok: undefined });

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        const next = await runUntilNext(getAuth, request, makeResponseStub());

        expect(next).toHaveBeenCalledTimes(1);
        expect(request.authContext).toBeUndefined();
    });

    it('proceeds anonymously when the user lookup fails for a reason that is not infrastructure', async () => {
        // Not every rejection is a DB outage — an unrecognised shape must still fail OPEN, the
        // same as an invalid token, rather than 503ing on anything unfamiliar.
        mockedVerifyAccessToken.mockRejectedValue(new Error('unexpected'));

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        const next = await runUntilNext(getAuth, request, makeResponseStub());

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith();
        expect(request.authContext).toBeUndefined();
    });

    // A DB blip must not be told to the client as "your credentials are wrong" (RFC 9110
    // §15.5.2). `getAuth` forwards it to the global error handler instead, which answers 503.
    it('forwards an infrastructure failure to the error handler, instead of going anonymous', async () => {
        const outage = Object.assign(new Error('server selection timed out'), {
            name: 'MongooseServerSelectionError'
        });
        mockedVerifyAccessToken.mockRejectedValue(outage);

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        const next = await runUntilNext(getAuth, request, makeResponseStub());

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(outage);
        expect(request.authContext).toBeUndefined();
    });

    it('never sends a response of its own', async () => {
        // It identifies; it does not authorize. Any status set here would pre-empt the route.
        mockedVerifyAccessToken.mockResolvedValue({ miss: 'malformed' });
        const response = makeResponseStub();

        await runUntilNext(getAuth, makeRequest({ authorization: 'Bearer x' }), response);

        expect(response.status).not.toHaveBeenCalled();
        expect(response.json).not.toHaveBeenCalled();
    });

    // A forged or garbled bearer has no customer behind it: it is audited and counted. A stale
    // one (expired, or a revoked session) is only a metric — the FE token expires every few minutes.
    it.each([
        ['invalid_signature', coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE],
        ['malformed', coreAuditActions.SECURITY_TOKEN_MALFORMED]
    ] as const)('audits a %s bearer JWT as a security event', async (reason, action) => {
        mockedVerifyAccessToken.mockResolvedValue({ miss: reason });
        securityEventsTotal.reset();

        const request = makeRequest({ authorization: 'Bearer forged.token' });
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action,
                outcome: 'failure',
                actorUserId: 'anonymous',
                metadata: expect.objectContaining({ kind: 'session', route: '/protected' })
            })
        );
        const counted = await securityEventsTotal.get();
        expect(counted.values).toEqual([
            expect.objectContaining({ labels: { event: action }, value: 1 })
        ]);
    });

    it.each(['expired', 'revoked'] as const)(
        'only counts a %s bearer JWT, without an audit entry',
        async (reason) => {
            mockedVerifyAccessToken.mockResolvedValue({ miss: reason });
            staleCredentialsTotal.reset();

            await runUntilNext(
                getAuth,
                makeRequest({ authorization: 'Bearer stale.token' }),
                makeResponseStub()
            );

            expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
            const counted = await staleCredentialsTotal.get();
            expect(counted.values).toEqual([
                expect.objectContaining({ labels: { kind: 'session', reason }, value: 1 })
            ]);
        }
    );

    it.each([
        ['invalid_signature', coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE],
        ['malformed', coreAuditActions.SECURITY_TOKEN_MALFORMED],
        ['revoked', coreAuditActions.SECURITY_API_KEY_REVOKED]
    ] as const)('audits a %s sk_ credential as a security event', async (reason, action) => {
        mockedResolveCredential.mockResolvedValue({ miss: reason });

        await runUntilRefused(makeRequest({ authorization: 'Bearer sk_abcdefgh_secret' }));

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action,
                metadata: expect.objectContaining({ kind: 'api_key' })
            })
        );
    });

    it('only counts an expired sk_ credential, without an audit entry', async () => {
        mockedResolveCredential.mockResolvedValue({ miss: 'expired' });

        await runUntilRefused(makeRequest({ authorization: 'Bearer sk_abcdefgh_secret' }));

        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    });

    it.each(['malformed', 'invalid_signature', 'expired', 'revoked'] as const)(
        'answers 401 with WWW-Authenticate for a %s sk_ credential, never anonymous',
        async (reason) => {
            mockedResolveCredential.mockResolvedValue({ miss: reason });
            const request = makeRequest({ authorization: 'Bearer sk_abcdefgh_secret' });

            const { response, setHeader } = await runUntilRefused(request);

            expect(response.status).toHaveBeenCalledWith(401);
            expect(setHeader).toHaveBeenCalledWith(
                'WWW-Authenticate',
                'Bearer error="invalid_token"'
            );
            expect(request.caller).toBeUndefined();
        }
    );

    it('resolves once when two mounted routers both apply it to the same request', async () => {
        // Two modules sharing a URL prefix (`account`, `addresses`) both mount this guard on
        // their own router; an unmatched request in the first falls through Express to the
        // second. The JWT boundary must be hit once, not twice.
        const resolved = { ...asAdmin('user-1'), username: 'tester', imageUrl: '/images/a.png' };
        mockedVerifyAccessToken.mockResolvedValue({ ok: resolved });

        const request = makeRequest({ authorization: 'Bearer valid.token' });
        await runUntilNext(getAuth, request, makeResponseStub());
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(mockedVerifyAccessToken).toHaveBeenCalledTimes(1);
        expect(request.authContext).toEqual(resolved);
    });

    it('resolves once for a credential caller across two mounted routers', async () => {
        const request = makeRequest();
        request.caller = { kind: 'credential', credentialId: 'cred-1' } as never;

        const next = await runUntilNext(getAuth, request, makeResponseStub());

        // Already resolved (by whichever router ran first) — the second pass must not touch the
        // JWT boundary at all, credential or not.
        expect(next).toHaveBeenCalledTimes(1);
        expect(mockedVerifyAccessToken).not.toHaveBeenCalled();
    });

    // The credential twin of the JWT-path test above: `resolveCredential` failing because
    // the database is unreachable is not "unknown credential" (which resolves `undefined`, never
    // rejects — see `resolveCredential`'s own docblock).
    it('forwards an infrastructure failure on the credential path too, instead of going anonymous', async () => {
        const outage = Object.assign(new Error('server selection timed out'), {
            name: 'MongooseServerSelectionError'
        });
        mockedResolveCredential.mockRejectedValue(outage);

        const request = makeRequest({ authorization: 'Bearer sk_test_abc' });
        const next = await runUntilNext(getAuth, request, makeResponseStub());

        expect(next).toHaveBeenCalledTimes(1);
        expect(next).toHaveBeenCalledWith(outage);
        expect(request.caller).toBeUndefined();
    });
});

/** A cookie-carrying request; `origin` is what an `Origin` header would say. */
const makeCookieModeRequest = (
    options: { method?: string; origin?: string; authorization?: string } = {}
) =>
    asStub<Request>({
        cookies: { '__Host-session': 'ses_the-cookie' },
        header: jest.fn((name: string) =>
            name === 'Authorization' ? options.authorization : undefined
        ),
        get: jest.fn((name: string) => (name === 'Origin' ? options.origin : undefined)),
        path: '/orders',
        method: options.method ?? 'GET',
        headers: {}
    });

/**
 * `cookie` session mode: the session cookie authenticates ordinary routes, so `getAuth` reads it
 * when no `Authorization` header is sent — and, since a cookie rides along on requests the user
 * never meant to make, refuses an UNSAFE one from a foreign origin before resolving anything.
 */
describe('getAuth in cookie mode', () => {
    beforeEach(() => {
        cookieAuthenticates = true;
        fromRefreshToken.mockReset();
    });

    afterEach(() => {
        cookieAuthenticates = false;
    });

    it('resolves the caller from the cookie, and says the session came by cookie', async () => {
        const resolved = asCustomer('user-1');
        fromRefreshToken.mockResolvedValue({ ok: resolved });

        const request = makeCookieModeRequest();
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(fromRefreshToken).toHaveBeenCalledWith('ses_the-cookie');
        expect(request.authContext).toEqual(resolved);
        expect(request.sessionVia).toBe('cookie');
    });

    it('prefers a bearer header to the cookie, and says so', async () => {
        fromAccessToken.mockResolvedValue({ ok: asCustomer('user-1') });

        const request = makeCookieModeRequest({ authorization: 'Bearer ses_the-header' });
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(fromAccessToken).toHaveBeenCalledWith('ses_the-header');
        expect(fromRefreshToken).not.toHaveBeenCalled();
        expect(request.sessionVia).toBe('bearer');
    });

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])(
        'refuses a %s naming a foreign origin with 403, resolving nothing',
        (method) => {
            const response = makeResponseStub();
            const next = jest.fn();

            getAuth(
                makeCookieModeRequest({ method, origin: 'https://evil.example' }),
                response,
                next
            );

            expect(response.status).toHaveBeenCalledWith(403);
            expect(next).not.toHaveBeenCalled();
            expect(fromRefreshToken).not.toHaveBeenCalled();
        }
    );

    it.each(['POST', 'DELETE'])('lets a %s from an allowed origin through', async (method) => {
        fromRefreshToken.mockResolvedValue({ ok: asCustomer('user-1') });

        const request = makeCookieModeRequest({ method, origin: 'http://localhost:8080' });
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(request.sessionVia).toBe('cookie');
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])(
        'does not ask a safe %s for an origin — it changes nothing',
        async (method) => {
            fromRefreshToken.mockResolvedValue({ ok: asCustomer('user-1') });

            const request = makeCookieModeRequest({ method, origin: 'https://evil.example' });
            await runUntilNext(getAuth, request, makeResponseStub());

            expect(request.sessionVia).toBe('cookie');
        }
    );

    it('lets an unsafe request with no Origin through, as a non-browser client sends it', async () => {
        fromRefreshToken.mockResolvedValue({ ok: asCustomer('user-1') });

        const request = makeCookieModeRequest({ method: 'POST' });
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(request.sessionVia).toBe('cookie');
    });

    it('does not ask a bearer-authenticated unsafe request for an origin: no ambient credential', async () => {
        fromAccessToken.mockResolvedValue({ ok: asCustomer('user-1') });

        const request = makeCookieModeRequest({
            method: 'POST',
            origin: 'https://evil.example',
            authorization: 'Bearer ses_the-header'
        });
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(request.sessionVia).toBe('bearer');
    });

    it('goes anonymous for a refused cookie, and clears it so it is never sent again', async () => {
        fromRefreshToken.mockResolvedValue({ miss: 'revoked' });
        clearDeadCookie.mockClear();

        const request = makeCookieModeRequest();
        const response = makeResponseStub();
        await runUntilNext(getAuth, request, response);

        expect(request.authContext).toBeUndefined();
        expect(request.sessionVia).toBeUndefined();
        expect(clearDeadCookie).toHaveBeenCalledWith(response);
    });

    it('leaves a cookie alone when it resolved, even to nobody', async () => {
        clearDeadCookie.mockClear();

        fromRefreshToken.mockResolvedValue({ ok: asCustomer('user-1') });
        await runUntilNext(getAuth, makeCookieModeRequest(), makeResponseStub());
        fromRefreshToken.mockResolvedValue({ ok: undefined });
        await runUntilNext(getAuth, makeCookieModeRequest(), makeResponseStub());

        expect(clearDeadCookie).not.toHaveBeenCalled();
    });

    it('does not clear a cookie when the resolver is down: nothing says it is dead', async () => {
        clearDeadCookie.mockClear();
        fromRefreshToken.mockRejectedValue(new Error('mongo is down'));

        await runUntilNext(getAuth, makeCookieModeRequest(), makeResponseStub());

        expect(clearDeadCookie).not.toHaveBeenCalled();
    });

    it('lets isAuth accept a cookie-authenticated session', async () => {
        fromRefreshToken.mockResolvedValue({ ok: asCustomer('user-1') });
        const request = makeCookieModeRequest();
        await runUntilNext(getAuth, request, makeResponseStub());
        const next = jest.fn();

        isAuth(request, makeResponseStub(), next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('ignores the cookie in jwt mode, where it opens only the SSE streams', async () => {
        cookieAuthenticates = false;

        const request = makeCookieModeRequest();
        await runUntilNext(getAuth, request, makeResponseStub());

        expect(fromRefreshToken).not.toHaveBeenCalled();
        expect(request.authContext).toBeUndefined();
    });
});

describe('isAuth', () => {
    it('passes through when both an auth context and a token are present', () => {
        const next = jest.fn();
        const response = makeResponseStub();

        isAuth(
            makeRequest({ authorization: 'Bearer valid.token', authContext: asCustomer('user-1') }),
            response,
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects with 401 when there is no auth context', () => {
        const next = jest.fn();
        const response = makeResponseStub();

        isAuth(makeRequest({ authorization: 'Bearer stale.token' }), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({ success: false, status: 401 })
        );
    });

    it('rejects with 401 when a context exists but the bearer token is gone', () => {
        // Both conditions are required. Accepting a context without its token would let an
        // already-populated request object stand in for a credential.
        const next = jest.fn();
        const response = makeResponseStub();

        isAuth(makeRequest({ authContext: asCustomer('user-1') }), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('records an anonymous unauthorized audit event on rejection', () => {
        isAuth(makeRequest(), makeResponseStub(), jest.fn());

        expect(mockedEmitAuditEvent).toHaveBeenCalledTimes(1);
        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_UNAUTHORIZED,
                actorUserId: 'anonymous',
                actorRole: 'anonymous',
                outcome: 'failure'
            })
        );
    });

    it('records nothing when the request is allowed through', () => {
        isAuth(
            makeRequest({ authorization: 'Bearer valid.token', authContext: asCustomer('user-1') }),
            makeResponseStub(),
            jest.fn()
        );

        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    });
});

describe('isAuthOrCredential', () => {
    it('passes through a bearer-authenticated human session', () => {
        const next = jest.fn();

        isAuthOrCredential(
            makeRequest({ authorization: 'Bearer valid.token', authContext: asCustomer('user-1') }),
            makeResponseStub(),
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('passes through a resolved API-key credential', () => {
        const next = jest.fn();

        isAuthOrCredential(makeCredentialRequest(), makeResponseStub(), next);

        expect(next).toHaveBeenCalledTimes(1);
    });

    /**
     * The regression this guard exists to close: `requirePermissionViaCookie` sets `caller`
     * exactly as the credential branch does, so `caller`'s bare presence used to admit a
     * cookie-only request here as if it were a credential. A route mounting this guard never
     * built to accept a refresh cookie must still refuse one.
     */
    it('rejects with 401 a caller resolved from the refresh cookie alone, no bearer token', () => {
        const next = jest.fn();
        const response = makeResponseStub();

        isAuthOrCredential(makeRequest({ authContext: asCustomer('user-1') }), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('rejects with 401 when neither a session nor a credential was resolved', () => {
        const next = jest.fn();
        const response = makeResponseStub();

        isAuthOrCredential(makeRequest(), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });
});

describe('requirePermission', () => {
    it('passes an unrestricted caller through', () => {
        const next = jest.fn();
        const response = makeResponseStub();

        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest({ authContext: asAdmin('user-1') }),
            response,
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects an authenticated caller without the wildcard with 403', () => {
        const next = jest.fn();
        const response = makeResponseStub();

        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest({ authContext: asCustomer('user-1') }),
            response,
            next
        );

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('refuses a caller holding only the narrow key of the same action and subject', () => {
        // `read:Payment` and `display:Payment` are both `read` on `Payment`, and every
        // signed-in account holds the first: the guard asks for the literal key, or a customer
        // reads the staff list.
        const customer = runPaymentsStaffGuard(asCustomer('user-1'));
        const staff = runPaymentsStaffGuard(asAdmin('user-2'));

        expect(customer.next).not.toHaveBeenCalled();
        expect(customer.response.status).toHaveBeenCalledWith(403);
        expect(staff.next).toHaveBeenCalledTimes(1);
    });

    it('tells a staff member without an authenticator app to enrol, not just no', () => {
        const unarmed = { ...asAdmin('user-1'), authenticatorArmed: false };
        const next = jest.fn();
        const response = makeResponseStub();

        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest({ authContext: unarmed }),
            response,
            next
        );

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(403);
        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [expect.objectContaining({ code: 'SECOND_FACTOR_ENROLLMENT_REQUIRED' })]
            })
        );
        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({ reason: 'second_factor_enrollment_required' })
            })
        );
    });

    it('does not say so to a customer, who could never hold the rule', () => {
        const response = makeResponseStub();

        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest({ authContext: asCustomer('user-1') }),
            response,
            jest.fn()
        );

        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [expect.objectContaining({ code: 'FORBIDDEN' })]
            })
        );
    });

    it('answers 401, not 403, for an unauthenticated caller', () => {
        // No `authContext` at all means no credentials were presented — 401, distinct from the
        // case above (authenticated, just not admin), which is 403.
        const next = jest.fn();
        const response = makeResponseStub();

        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(makeRequest(), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('distinguishes not-authenticated from not-permitted in the audit trail', () => {
        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest(),
            makeResponseStub(),
            jest.fn()
        );

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                // An absent session is an authentication failure, so it is audited as one — the
                // same action `isAuth` emits, rather than a permission denial.
                action: coreAuditActions.SECURITY_UNAUTHORIZED,
                actorUserId: 'anonymous',
                actorRole: 'anonymous',
                metadata: expect.objectContaining({ reason: 'not_authenticated' })
            })
        );
    });

    it('attributes a not-permitted denial to the actual user, not to anonymous', () => {
        // The whole value of the audit record: "who tried". Falling back to 'anonymous' here
        // would erase the identity of a real user probing admin routes.
        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest({ authContext: asCustomer('user-9') }),
            makeResponseStub(),
            jest.fn()
        );

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actorUserId: 'user-9',
                metadata: expect.objectContaining({ reason: 'missing_permission' })
            })
        );
    });

    it('separates "not authenticated" (401) from "not permitted" (403)', () => {
        /*
         * The statuses differ because the client's next move differs: 401 means "authenticate and
         * retry", which the frontend turns into a login redirect that returns the visitor to where
         * they were aiming; 403 means "you are known and still refused", where logging in again
         * would only loop. Answering 403 to an expired session sent it to the error page.
         *
         * The bodies stay generic and identical — which check refused is recorded in the audit
         * trail (`reason`, asserted above), not disclosed to whoever is probing.
         */
        const unauthenticated = makeResponseStub();
        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest(),
            unauthenticated,
            jest.fn()
        );

        const nonAdmin = makeResponseStub();
        requirePermission(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeRequest({ authContext: asCustomer('user-9') }),
            nonAdmin,
            jest.fn()
        );

        expect(unauthenticated.status).toHaveBeenCalledWith(401);
        expect(nonAdmin.status).toHaveBeenCalledWith(403);
    });

    it('refuses an API-key credential a platform rule with 403, and audits why', () => {
        // An api-key is tenant-scoped by construction, so it can never satisfy a platform rule.
        const response = makeResponseStub();
        const next = jest.fn();

        requirePermission('read', 'ObservabilitySnapshot')(makeCredentialRequest(), response, next);

        expect(response.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_FORBIDDEN,
                metadata: expect.objectContaining({
                    reason: 'credential_wrong_scope',
                    permission: expect.stringContaining('ObservabilitySnapshot')
                })
            })
        );
    });
});

/**
 * `requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)` — admin elevation proved by the refresh COOKIE rather than a bearer header.
 *
 * It exists for the requests a browser makes without JavaScript setting a header: a PDF invoice
 * opened in a new tab, an `EventSource` stream. Those cannot carry `Authorization`, so the
 * `HttpOnly` refresh cookie is the credential — verified for signature *and* presence on the user
 * document, so a logged-out or revoked token is rejected rather than merely an expired one.
 *
 * It had NO tests at all: 35 of its mutants had no coverage, which is why the file scored 49.40%
 * overall while scoring 85.42% on the part that was covered. That split is the diagnosis — the
 * assertions that existed were good, this middleware simply wasn't reached by any of them.
 *
 * It is worth more than its size suggests: it gates a key, it is agnostic boilerplate every
 * derived project inherits, and its failure mode is silent. A mutant that turns the ability's
 * `can()` into `true` hands every logged-in user a document only a key-holder may read.
 */
describe('requirePermissionViaCookie', () => {
    /** An admin user document, as `findById` resolves one. */
    const adminUser = { ...asAdmin('admin-1'), username: 'root', imageUrl: '/images/root.png' };

    it('rejects with 401 when there is no session cookie at all', () => {
        const response = makeResponseStub();
        const next = jest.fn();

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest(),
            response,
            asStub<NextFunction>(next)
        );

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        // The token is never even verified — no point paying for a signature check.
        expect(mockedVerifyRefreshToken).not.toHaveBeenCalled();
    });

    it('rejects an empty cookie value the same way as a missing one', () => {
        const response = makeResponseStub();

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest(''),
            response,
            asStub<NextFunction>(jest.fn())
        );

        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('verifies the REFRESH token, not the access token', async () => {
        // The whole design decision: the cookie holds a refresh token, and verifying it against
        // the access-token secret would either always fail or, worse, accept the wrong audience.
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: adminUser });

        await runUntilNext(
            requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT),
            makeCookieRequest('cookie.jwt'),
            makeResponseStub()
        );

        expect(mockedVerifyRefreshToken).toHaveBeenCalledWith('cookie.jwt');
        expect(mockedVerifyAccessToken).not.toHaveBeenCalled();
    });

    it('admits an unrestricted caller and calls next exactly once', async () => {
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: adminUser });

        const next = await runUntilNext(
            requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT),
            makeCookieRequest('cookie.jwt'),
            makeResponseStub()
        );

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('populates authContext with the resolved caller', async () => {
        // Downstream handlers read the caller's keys; a context that arrives without them turns
        // an authorized request into a confusing 403 further down.
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: adminUser });
        const request = makeCookieRequest('cookie.jwt');

        await runUntilNext(
            requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT),
            request,
            makeResponseStub()
        );

        expect(request.authContext).toEqual(adminUser);
        expect(request.caller).toEqual(callerInScope(adminUser, 'tenant'));
    });

    it('rejects a valid session without the wildcard with 403', async () => {
        // The mutant that matters most: a key check forced to `true` would hand every logged-in
        // customer a document only the shop's staff may see.
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: asCustomer('user-1') });
        const response = makeResponseStub();
        const next = jest.fn();

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest('cookie.jwt'),
            response,
            asStub<NextFunction>(next)
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(response.status).toHaveBeenCalledWith(403);
        expect(next).not.toHaveBeenCalled();
    });

    it('rejects with 403 when the token is valid but the user is gone', async () => {
        // The resolver answers `undefined` — a deleted account holding a still-signed cookie.
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: undefined });
        const response = makeResponseStub();

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest('cookie.jwt'),
            response,
            asStub<NextFunction>(jest.fn())
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(response.status).toHaveBeenCalledWith(403);
    });

    it('records a forbidden attempt in the audit trail', async () => {
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: asCustomer('user-1') });

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest('cookie.jwt'),
            makeResponseStub(),
            asStub<NextFunction>(jest.fn())
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actorUserId: 'user-1',
                outcome: 'failure'
            })
        );
    });

    it('names the anonymous actor when the user could not be loaded', async () => {
        // `user?.id ?? 'anonymous'` — an audit row with an empty actor is a row nobody can act on.
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: undefined });

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest('cookie.jwt'),
            makeResponseStub(),
            asStub<NextFunction>(jest.fn())
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({ actorUserId: 'anonymous' })
        );
    });

    it('rejects a cookie whose signature does not verify, with 401 not 403', async () => {
        // 401 and 403 are different statements: "I do not know who you are" versus "I know, and
        // no". A forged cookie is the first.
        mockedVerifyRefreshToken.mockResolvedValueOnce({ miss: 'invalid_signature' });
        const response = makeResponseStub();
        const next = jest.fn();

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest('forged.jwt'),
            response,
            asStub<NextFunction>(next)
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(response.status).toHaveBeenCalledWith(401);
        expect(next).not.toHaveBeenCalled();
        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: coreAuditActions.SECURITY_TOKEN_INVALID_SIGNATURE })
        );
    });

    it('audits a request that arrives with no cookie at all', async () => {
        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest(),
            makeResponseStub(),
            asStub<NextFunction>(jest.fn())
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({ action: coreAuditActions.SECURITY_UNAUTHORIZED })
        );
    });

    it('rejects with 401 when the user lookup itself fails', async () => {
        // The `.catch()` covers the whole chain, not just the token verification — a database
        // outage must not become an unhandled rejection in a middleware.
        mockedVerifyRefreshToken.mockRejectedValueOnce(new Error('mongo is down'));
        const response = makeResponseStub();

        requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
            makeCookieRequest('cookie.jwt'),
            response,
            asStub<NextFunction>(jest.fn())
        );
        await new Promise((resolve) => setImmediate(resolve));

        expect(response.status).toHaveBeenCalledWith(401);
    });
});

/** A request the guard admitted: it carries the recheck the guard left on it. */
const admittedRequest = () => {
    const request = makeCookieRequest('cookie.jwt');
    request.sessionRecheck = () => recheckFamily() as never;
    return request;
};

/**
 * `stillHoldsRuleViaCookie` — the same verdict as `requirePermissionViaCookie`, re-run outside the
 * request lifecycle for the SSE stream's 30-second recheck. It never rejects: a resolver failure
 * must fail the stream closed exactly like a role that no longer holds the rule, since the stream
 * cannot tell the two apart and must not hang waiting to find out.
 */
describe('stillHoldsRuleViaCookie', () => {
    const adminUser = { ...asAdmin('admin-1'), username: 'root', imageUrl: '/images/root.png' };

    it('resolves true for a caller who still holds the rule', async () => {
        recheckFamily.mockResolvedValueOnce({ ok: adminUser });

        await expect(
            stillHoldsRuleViaCookie(admittedRequest(), ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)
        ).resolves.toBe(true);
    });

    it('resolves false when the caller no longer holds the rule', async () => {
        recheckFamily.mockResolvedValueOnce({ ok: asCustomer('user-1') });

        await expect(
            stillHoldsRuleViaCookie(admittedRequest(), ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)
        ).resolves.toBe(false);
    });

    it('resolves false when the session no longer names anyone', async () => {
        recheckFamily.mockResolvedValueOnce({ ok: undefined });

        await expect(
            stillHoldsRuleViaCookie(admittedRequest(), ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)
        ).resolves.toBe(false);
    });

    it('resolves false once the session family is gone', async () => {
        recheckFamily.mockResolvedValueOnce({ miss: 'revoked' });

        await expect(
            stillHoldsRuleViaCookie(admittedRequest(), ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)
        ).resolves.toBe(false);
    });

    it('fails closed, not rejected, when the recheck itself throws', async () => {
        // A datastore outage — the stream must close, not hang on an unhandled rejection.
        recheckFamily.mockRejectedValueOnce(new Error('mongo is down'));

        await expect(
            stillHoldsRuleViaCookie(admittedRequest(), ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)
        ).resolves.toBe(false);
    });

    it('fails closed for a request the guard never admitted', async () => {
        await expect(
            stillHoldsRuleViaCookie(
                makeCookieRequest('cookie.jwt'),
                ADMIN_ONLY_ACTION,
                ADMIN_ONLY_SUBJECT
            )
        ).resolves.toBe(false);
        expect(recheckFamily).not.toHaveBeenCalled();
    });

    it('audits the refusal the same way the connect-time guard does', async () => {
        recheckFamily.mockResolvedValueOnce({ ok: asCustomer('user-1') });

        await stillHoldsRuleViaCookie(admittedRequest(), ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT);

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_FORBIDDEN,
                actorUserId: 'user-1',
                outcome: 'failure'
            })
        );
    });

    it('does not audit a passing recheck', async () => {
        recheckFamily.mockResolvedValueOnce({ ok: adminUser });

        await stillHoldsRuleViaCookie(admittedRequest(), ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT);

        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    });

    it('is bound to the family the guard saw, not to the cookie value presented later', async () => {
        mockedVerifyRefreshToken.mockResolvedValueOnce({ ok: adminUser });
        const request = makeCookieRequest('cookie.jwt');
        await new Promise<void>((resolve) => {
            requirePermissionViaCookie(ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)(
                request,
                makeResponseStub(),
                () => {
                    resolve();
                }
            );
        });
        recheckFamily.mockResolvedValueOnce({ ok: adminUser });
        // The cookie rotates after connect; the old value would now be refused.
        request.cookies = { '__Host-session': 'rotated.jwt' };

        await expect(
            stillHoldsRuleViaCookie(request, ADMIN_ONLY_ACTION, ADMIN_ONLY_SUBJECT)
        ).resolves.toBe(true);
        expect(mockedVerifyRefreshToken).toHaveBeenCalledTimes(1);
    });
});

/**
 * `requireFreshAuth`/`requireFreshAuthWhen` — the step-up gate. MUST run
 * after `isAuth`, so every case here starts from an already-authenticated `authContext` carrying
 * `authTime`.
 */
describe('requireFreshAuth', () => {
    it('passes a session authenticated well within the window', () => {
        const next = jest.fn();
        const response = makeStepUpResponseStub();

        requireFreshAuth('critical')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() } }),
            response,
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('rejects a session authenticated just outside the window, with 401', () => {
        const next = jest.fn();
        const response = makeStepUpResponseStub();

        requireFreshAuth('critical')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() - 301 } }),
            response,
            next
        );

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('passes a session authenticated exactly at the boundary — inclusive, not exclusive', () => {
        const next = jest.fn();
        const response = makeStepUpResponseStub();

        requireFreshAuth('critical')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() - 300 } }),
            response,
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
    });

    it('carries REAUTH_REQUIRED and the tier in the error envelope', () => {
        const response = makeStepUpResponseStub();

        requireFreshAuth('critical')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() - 999 } }),
            response,
            jest.fn()
        );

        expect(response.json).toHaveBeenCalledWith(
            expect.objectContaining({
                errors: [
                    expect.objectContaining({
                        code: 'REAUTH_REQUIRED',
                        details: { maxAge: 300 }
                    })
                ]
            })
        );
    });

    it('sets WWW-Authenticate for anything that speaks OAuth', () => {
        const response = makeStepUpResponseStub();

        requireFreshAuth('critical')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() - 999 } }),
            response,
            jest.fn()
        );

        expect(response.setHeader).toHaveBeenCalledWith(
            'WWW-Authenticate',
            'Bearer error="insufficient_user_authentication", max_age=300'
        );
    });

    it('answers 401 defensively when mounted without isAuth first, rather than throwing', () => {
        // The expected path always has isAuth upstream; this is what stops a route that forgets
        // it from crashing instead of merely misbehaving.
        const next = jest.fn();
        const response = makeStepUpResponseStub();

        requireFreshAuth('critical')(makeRequest(), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    /*
     * The module docblock promises "every rejection from the identity guards is audited",
     * but this direct mount challenged with no trail at all — unlike `requirePermission`'s own
     * declared-stepUp path, which already emits the same action.
     */
    it('audits the refusal with SECURITY_REAUTH_REQUIRED, same as the declared-stepUp path', () => {
        requireFreshAuth('critical')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() - 999 } }),
            makeStepUpResponseStub(),
            jest.fn()
        );

        expect(mockedEmitAuditEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                action: coreAuditActions.SECURITY_REAUTH_REQUIRED,
                actorUserId: 'user-1',
                outcome: 'failure'
            })
        );
    });

    it('does not audit a session that passes the freshness check', () => {
        requireFreshAuth('critical')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() } }),
            makeStepUpResponseStub(),
            jest.fn()
        );

        expect(mockedEmitAuditEvent).not.toHaveBeenCalled();
    });
});

describe('requireFreshAuthWhen', () => {
    it("skips the gate entirely when the predicate says this request doesn't need it", () => {
        // PUT /account uploading a new avatar: the predicate reads the body and says "no email
        // change", so a stale session must not be asked for a password it wasn't going to need.
        const next = jest.fn();
        const response = makeResponseStub();

        requireFreshAuthWhen(() => false, 'sensitive')(staleRequest(), response, next);

        expect(next).toHaveBeenCalledTimes(1);
        expect(response.status).not.toHaveBeenCalled();
    });

    it('applies requireFreshAuth when the predicate says this request needs it', () => {
        const next = jest.fn();
        const response = makeStepUpResponseStub();

        requireFreshAuthWhen(() => true, 'sensitive')(staleRequest(), response, next);

        expect(next).not.toHaveBeenCalled();
        expect(response.status).toHaveBeenCalledWith(401);
    });

    it('passes a fresh session through even when the predicate says it needs checking', () => {
        const next = jest.fn();
        const response = makeResponseStub();

        requireFreshAuthWhen(() => true, 'sensitive')(
            makeRequest({ authContext: { ...asCustomer('user-1'), authTime: nowSeconds() } }),
            response,
            next
        );

        expect(next).toHaveBeenCalledTimes(1);
    });
});
