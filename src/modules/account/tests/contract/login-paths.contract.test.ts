/**
 * @module
 * `login-paths`: the invariants every way of getting a session shares, tested ONCE across
 * every entry point instead of once per bug that found a gap in one of them (an OAuth login
 * audited/metriced wrong; a deactivated/soft-deleted account completing an OAuth login or a
 * refresh). Password login was never buggy, but had no table entry either — it is the
 * baseline every other path is checked against here.
 *
 * Two rules, two tables:
 * - refusal: none of the three paths may produce a session for a deactivated or soft-deleted
 *   account.
 * - success: password login and OAuth login both funnel through `recordLoginSuccess`
 *   (`session/login-observability.ts`), so both must audit the caller's REAL role and increment
 *   the shared `auth_login_total` counter. Refresh is not in this second table on purpose — it
 *   audits its own `AUTH_TOKEN_REFRESHED` action and its own `auth_refresh_total` counter
 *   (`services/authentication.ts#refreshAccessToken`), a different rule, not a missing test of
 *   this one.
 */

import '@tests/contract';
import type { Response } from 'supertest';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setCookie, cookieHeader } from '@tests/cookies';
import { createUser, PLAIN_PASSWORD, userRepository } from '@modules/users/tests/factories';
import { registerOAuthProvider } from '../../oauth/providers';
import { fakeOAuthProvider } from '../../oauth/providers/fake';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { accountAuditActions } from '../../audit';
import { authLoginTotal } from '../../metrics';

/* Replaced, not spied on — a CommonJS namespace import exposes each export as a
 * non-configurable getter, which `jest.spyOn` cannot redefine under every transform this repo
 * runs tests under. See `tests/support/ports.ts`. */
jest.mock('@infrastructure/observability/audit', () => {
    const actual = jest.requireActual<typeof import('@infrastructure/observability/audit')>(
        '@infrastructure/observability/audit'
    );
    const emitAuditEvent = jest.fn();
    return {
        __esModule: true,
        ...actual,
        emitAuditEvent,
        // `recordAudit` closes over its own module's real `emitAuditEvent`, immune to the
        // override above — reroute it through the replacement so a spy on `emitAuditEvent` still
        // sees every `recordAudit` call, exactly as it saw every direct one before.
        recordAudit: (
            context: Parameters<typeof actual.recordAudit>[0],
            fields: Parameters<typeof actual.recordAudit>[1]
        ) => {
            if (!context) return;
            emitAuditEvent(actual.buildAuditEvent(context, fields));
        }
    };
});

setupTestDb();

/** OAuth needs the fake provider — production seeds no such entry, so this suite registers it. */
beforeAll(() => {
    registerOAuthProvider('fake', () => fakeOAuthProvider);
});
afterEach(() => {
    jest.restoreAllMocks();
});

/** The fixed identity the `fake` OAuth provider always answers with. */
const FAKE_OAUTH_EMAIL = 'oauth.demo@example.com';
const FAKE_OAUTH_PROVIDER_ID = 'fake-oauth-subject';

/** A start response's CSRF/PKCE cookies, as one `Cookie` header for the callback. */
const attemptCookies = (start: Response): string =>
    cookieHeader(start, 'oauth_state', 'oauth_verifier');

/** One full start → callback round trip through the fake provider. */
const fakeLogin = async (): Promise<Response> => {
    const start = await api().get('/account/oauth/fake');
    const callbackUrl = new URL(start.headers.location);
    return api()
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', attemptCookies(start));
};

/** The document overrides that put an account in each refused state. */
const badState = (kind: 'deactivated' | 'soft-deleted'): Record<string, unknown> =>
    kind === 'deactivated' ? { active: false } : { deletedAt: new Date() };

/**
 * One login/refresh entry point, exercised the way the real client would — over HTTP, through
 * the real routes.
 */
interface LoginPath {
    /** What every `describe.each`/`it.each` title names this path as. */
    name: string;

    /**
     * Puts an account in `kind`'s bad state, then attempts this path against it. `auditSpy` is
     * cleared right before the call under test — the refresh path's own setup includes a genuine,
     * successful login (to have a session to refuse continuing), and that setup event must not be
     * mistaken for what the REFUSED attempt itself audited.
     */
    attemptRefused: (
        kind: 'deactivated' | 'soft-deleted',
        auditSpy: jest.MockedFunction<typeof auditPort.emitAuditEvent>
    ) => Promise<Response>;

    /** What a refused attempt on this path must look like — no two paths answer the same shape. */
    assertRefused: (response: Response) => void;

    /**
     * Logs a healthy account in with the given membership role, returning the response and the
     * account's id (for the audit's `actor_user_id`). Omitted on the refresh path — see the
     * module doc on why it isn't in the success table.
     */
    attemptSuccess?: (
        role: 'admin' | 'customer'
    ) => Promise<{ response: Response; userId: string }>;

    /** The status a SUCCESSFUL attempt on this path answers with. */
    successStatus?: number;
}

/** `POST /account/login`. */
const passwordPath: LoginPath = {
    name: 'password login',
    attemptRefused: async (kind, auditSpy) => {
        const user = await createUser({ email: `pw-${kind}@example.com`, ...badState(kind) });
        auditSpy.mockClear();
        return api().post('/account/login').send({ email: user.email, password: PLAIN_PASSWORD });
    },
    assertRefused: (response) => {
        expect(response.status).toBe(401);
    },
    attemptSuccess: async (role) => {
        const user = await createUser({ email: `pw-${role}@example.com` }, role);
        const response = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        return { response, userId: user.id };
    },
    successStatus: 200
};

/** `GET /account/oauth/fake/callback`, already-linked-identity branch (case 1 in `services/oauth.ts`). */
const oauthPath: LoginPath = {
    name: 'OAuth login',
    attemptRefused: async (kind, auditSpy) => {
        const user = await createUser({
            email: FAKE_OAUTH_EMAIL,
            verifiedAt: new Date(),
            ...badState(kind)
        });
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'fake',
            providerId: FAKE_OAUTH_PROVIDER_ID,
            connectedAt: new Date()
        });
        auditSpy.mockClear();
        return fakeLogin();
    },
    assertRefused: (response) => {
        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('error=');
        expect(setCookie(response, 'jwt')).toBeUndefined();
        expect(setCookie(response, 'isAuth')).toBeUndefined();
    },
    attemptSuccess: async (role) => {
        const user = await createUser({ email: FAKE_OAUTH_EMAIL, verifiedAt: new Date() }, role);
        await userRepository.linkOAuthAccount(user.id, {
            provider: 'fake',
            providerId: FAKE_OAUTH_PROVIDER_ID,
            connectedAt: new Date()
        });
        const response = await fakeLogin();
        return { response, userId: user.id };
    },
    successStatus: 302
};

/** `GET /account/refresh` — the mint-time backstop (`jwt.ts`'s `reissueRotated`), not a fresh login. */
const refreshPath: LoginPath = {
    name: 'refresh',
    attemptRefused: async (kind, auditSpy) => {
        const user = await createUser({ email: `refresh-${kind}@example.com` });
        const login = await api()
            .post('/account/login')
            .send({ email: user.email, password: PLAIN_PASSWORD });
        const jwtCookie = setCookie(login, 'jwt')!;

        // Deactivated/deleted AFTER the session was minted — the account holder's next refresh
        // must not continue it, same guard `createRefreshToken` applies at the initial mint.
        const loaded = await userRepository.findByIdWithCredentials(user.id);
        Object.assign(loaded!, badState(kind));
        await loaded!.save();

        // Cleared AFTER the setup login above (a genuine success, its own AUTH_LOGIN) and BEFORE
        // the refusal under test.
        auditSpy.mockClear();
        return api().get('/account/refresh').set('Cookie', jwtCookie);
    },
    assertRefused: (response) => {
        expect(response.status).toBe(401);
    }
};

describe.each([passwordPath, oauthPath, refreshPath])(
    '$name refuses a deactivated or soft-deleted account',
    ({ attemptRefused, assertRefused }) => {
        it.each(['deactivated', 'soft-deleted'] as const)(
            'rejects a %s account: no session, no successful AUTH_LOGIN',
            async (kind) => {
                const auditSpy = observePort(auditPort.emitAuditEvent);

                const response = await attemptRefused(kind, auditSpy);

                assertRefused(response);
                // A refused password attempt still audits an AUTH_LOGIN *failure* — same as a
                // wrong password, on purpose (an unknown/blocked account must cost an attacker no
                // less than a live one, see `services/authentication.ts#login`). What every path
                // shares is that NONE of them may audit a SUCCESS here.
                const successfulLogins = auditSpy.mock.calls.filter(
                    ([event]) =>
                        event.action === accountAuditActions.AUTH_LOGIN &&
                        event.outcome === 'success'
                );
                expect(successfulLogins).toHaveLength(0);
            }
        );
    }
);

describe.each([passwordPath, oauthPath])(
    '$name audits the real role and counts against the shared login metric',
    ({ attemptSuccess, successStatus }) => {
        it.each([
            ['admin', 'admin'],
            ['customer', 'user']
        ] as const)(
            'membership %s logs in audited as %s, exactly once',
            async (membershipRole, auditRole) => {
                const auditSpy = observePort(auditPort.emitAuditEvent);
                const incSpy = jest.spyOn(authLoginTotal, 'inc');

                const { response, userId } = await attemptSuccess!(membershipRole);

                expect(response.status).toBe(successStatus);
                const loginCalls = auditSpy.mock.calls.filter(
                    ([event]) => event.action === accountAuditActions.AUTH_LOGIN
                );
                expect(loginCalls).toHaveLength(1);
                expect(loginCalls[0][0]).toMatchObject({
                    actor_user_id: userId,
                    actor_role: auditRole,
                    outcome: 'success'
                });
                expect(incSpy).toHaveBeenCalledWith({ status: 'success' });
            }
        );
    }
);
