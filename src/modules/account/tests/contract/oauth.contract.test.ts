/**
 * @module
 * Contract tests for the OAuth surface: `GET /account/oauth/providers`, and the full
 * start → callback round trip through the `fake` provider (`enableDemoProfile()`) — the same path
 * a Cypress spec walks against a real browser, exercised here against the real routes, the real
 * CSRF cookie, and a real database.
 */

import '@tests/contract';
import { generate } from 'otplib';
import { decode } from 'jsonwebtoken';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setCookie, cookieHeader } from '@tests/cookies';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { enableDemoProfile } from '@infrastructure/runtime/demo-profile';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { accountAuditActions } from '../../audit';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

setupTestDb();

/** So the fake provider these cases need is switched off again for every other suite. */
beforeAll(() => {
    enableDemoProfile();
});
afterAll(() => {
    enableDemoProfile(false);
});
afterEach(() => jest.restoreAllMocks());

/**
 * A start response's `state` and `verifier` cookies, as one `Cookie` request header — both are
 * needed to redeem a callback since PKCE landed beside the CSRF check.
 */
const attemptCookies = (start: { headers: Record<string, unknown> }): string =>
    cookieHeader(start, 'oauth_state', 'oauth_verifier');

describe('GET /account/oauth/providers', () => {
    it('lists the fake provider under the demo profile', async () => {
        const response = await api().get('/account/oauth/providers');

        expect(response.status).toBe(200);
        expect(response.body.data.providers).toContain('fake');
    });
});

describe('GET /account/oauth/:provider', () => {
    it('answers 404 for a provider this deployment never configured', async () => {
        const response = await api().get('/account/oauth/not-a-real-provider');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
    });

    it('redirects to the consent step and sets the CSRF state and PKCE verifier cookies', async () => {
        const response = await api().get('/account/oauth/fake');

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('/account/oauth/fake/callback');
        expect(setCookie(response, 'oauth_state')).toBeTruthy();
        expect(setCookie(response, 'oauth_verifier')).toBeTruthy();
    });
});

describe('GET /account/oauth/:provider/callback', () => {
    it('answers 404 for a provider this deployment never configured', async () => {
        const response = await api().get('/account/oauth/not-a-real-provider/callback');

        expect(response.status).toBe(404);
    });

    it('answers 400 when the state cookie is missing entirely', async () => {
        const response = await api().get(
            '/account/oauth/fake/callback?code=fake-oauth-code&state=x'
        );

        expect(response.status).toBe(400);
    });

    it('answers 400 when the state does not match the cookie, and clears it', async () => {
        const start = await api().get('/account/oauth/fake');
        const stateCookie = setCookie(start, 'oauth_state')!;

        const response = await api()
            .get('/account/oauth/fake/callback?code=fake-oauth-code&state=not-the-real-state')
            .set('Cookie', stateCookie);

        expect(response.status).toBe(400);
        // Cleared even on failure, so a retried callback can't replay the same state twice.
        expect(setCookie(response, 'oauth_state')).toMatch(/oauth_state=;/);
    });

    it('answers 400 when the verifier cookie is missing, without ever reaching the token exchange', async () => {
        const start = await api().get('/account/oauth/fake');
        const stateCookie = setCookie(start, 'oauth_state')!.split(';')[0];
        const callbackUrl = new URL(start.headers.location);

        // The state cookie rides along, the verifier does not — the trap the build order warns
        // about: this must fail closed, not silently redeem the code with no PKCE at all.
        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', stateCookie);

        expect(response.status).toBe(400);
        expect(setCookie(response, 'oauth_state')).toMatch(/oauth_state=;/);
    });

    it('completes the round trip: session cookies set, user created, redirected to the frontend', async () => {
        const start = await api().get('/account/oauth/fake');
        const callbackUrl = new URL(start.headers.location);

        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', attemptCookies(start));

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('http://localhost:8080/oauth/callback');
        expect(setCookie(response, 'jwt')).toBeTruthy();
        expect(setCookie(response, 'isAuth')).toBeTruthy();

        const created = await userRepository.findOne({ email: 'oauth.demo@example.com' });
        expect(created).not.toBeNull();
        expect(created?.verifiedAt).toBeInstanceOf(Date);
    });

    it('logs the SAME account in on a second attempt rather than creating another one', async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const start = await api().get('/account/oauth/fake');
            const callbackUrl = new URL(start.headers.location);
            // Sequential on purpose: the second attempt only matters once the first has actually
            // landed — running them concurrently would test a race, not this.
            await api()
                .get(callbackUrl.pathname + callbackUrl.search)
                .set('Cookie', attemptCookies(start));
        }

        const matches = await userRepository.count({ email: 'oauth.demo@example.com' });
        expect(matches).toBe(1);
    });

    /*
     * B4: `recordLogin` (services/oauth.ts) used to hardcode `actor_role: 'user'` and never
     * touched `authLoginTotal` — an admin logging in through a provider was audited as a plain
     * user, and invisible to the shared login metric every other method reports through.
     */
    it('audits an admin already linked to the provider as admin, once, on login', async () => {
        const admin = await createUser(
            { email: 'oauth.demo@example.com', verifiedAt: new Date() },
            'admin'
        );
        const auditSpy = observePort(auditPort.emitAuditEvent);

        // First callback: no identity linked yet, email matches — this is the LINK branch, not
        // login, and audits its own AUTH_OAUTH_LINKED. Cleared before the case under test so only
        // the second callback's events are asserted.
        await (async () => {
            const start = await api().get('/account/oauth/fake');
            const callbackUrl = new URL(start.headers.location);
            await api()
                .get(callbackUrl.pathname + callbackUrl.search)
                .set('Cookie', attemptCookies(start));
        })();
        auditSpy.mockClear();

        const start = await api().get('/account/oauth/fake');
        const callbackUrl = new URL(start.headers.location);
        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', attemptCookies(start));

        expect(response.status).toBe(302);
        const loginCalls = auditSpy.mock.calls.filter(
            ([event]) => event.action === accountAuditActions.AUTH_LOGIN
        );
        expect(loginCalls).toHaveLength(1);
        expect(loginCalls[0][0]).toMatchObject({
            actor_user_id: admin.id,
            actor_role: 'admin',
            outcome: 'success'
        });
    });
});

/** One full start → callback round trip through the fake provider. */
const fakeLogin = async () => {
    const start = await api().get('/account/oauth/fake');
    const callbackUrl = new URL(start.headers.location);
    return api()
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', attemptCookies(start));
};

/**
 * The code a real authenticator app would show for this secret. `stepsFromNow` defaults to the
 * NEXT RFC 6238 step — same reasoning `tests/integration/two-factor.test.ts#codeFor` gives: the
 * confirm step already spent the "now" step, and replay protection refuses reusing it.
 */
const codeFor = (secret: string, stepsFromNow = 1): Promise<string> =>
    generate({ secret, epoch: Math.floor(Date.now() / 1000) + stepsFromNow * 30 });

describe('GET /account/oauth/:provider/callback — 2FA armed (1b)', () => {
    it('challenges instead of minting a session, and mints one only once the code is answered', async () => {
        // First login creates the OAuth-only account; enroll TOTP on it through its own session.
        const created = await fakeLogin();
        const refreshed = await api()
            .get('/account/refresh')
            .set('Cookie', setCookie(created, 'jwt')!);
        const bearer = `Bearer ${refreshed.body.data.token as string}`;
        const setup = await api()
            .post('/account/2fa/methods/totp/setup')
            .set('Authorization', bearer)
            .send();
        const { secret } = setup.body.data as { secret: string };
        await api()
            .post('/account/2fa/methods/totp/confirm')
            .set('Authorization', bearer)
            .send({ code: await codeFor(secret, 0) });

        // Second login: the same linked identity, now with 2FA armed.
        const challenged = await fakeLogin();

        expect(challenged.status).toBe(302);
        const location = new URL(challenged.headers.location);
        expect(location.origin + location.pathname).toBe('http://localhost:8080/oauth/callback');
        expect(location.searchParams.get('mfaRequired')).toBe('1');
        expect(location.searchParams.get('expiresAt')).toEqual(expect.any(String));
        const methods = JSON.parse(location.searchParams.get('methods')!) as { method: string }[];
        expect(methods.map((m) => m.method)).toEqual(['totp']);
        // No session — the whole point of 1b.
        expect(setCookie(challenged, 'jwt')).toBeUndefined();
        expect(setCookie(challenged, 'isAuth')).toBeUndefined();
        expect(setCookie(challenged, 'oauth_mfa_challenge')).toBeTruthy();

        // The challenge token never left the server — only its cookie did. `code` alone in the
        // body, carrying the cookie, is what a real browser can actually do here.
        const finished = await api()
            .post('/account/login/2fa')
            .set('Cookie', setCookie(challenged, 'oauth_mfa_challenge')!)
            .send({ code: await codeFor(secret) });

        expect(finished.status).toBe(200);
        const claims = decode(finished.body.data.token as string) as { amr?: string[] };
        expect(claims.amr).toEqual(['fake', 'otp']);
    });

    it('refuses to complete the challenge with no cookie and no challenge in the body', async () => {
        const response = await api().post('/account/login/2fa').send({ code: '000000' });

        expect(response.status).toBe(401);
    });
});
