/**
 * @module
 * Contract tests for the OAuth surface: `GET /account/oauth/providers`, and the full
 * start → callback round trip through the `fake` provider — the same path a Cypress spec walks
 * against a real browser, exercised here against the real routes, the real CSRF cookie, and a
 * real database. Registers `fake` the way the dev preload does: production seeds no such
 * entry, so this suite has to put it there itself.
 */

import '@tests/contract';
import { decode } from 'jsonwebtoken';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setCookie, cookieHeader } from '@tests/cookies';
import { codeFor } from '@tests/totp';
import { userRepository } from '@modules/users/tests/factories';
import { registerOAuthProvider } from '../../oauth/providers';
import { fakeOAuthProvider } from '@scenarios/support/doubles/oauth-fake';

setupTestDb();

beforeAll(() => {
    registerOAuthProvider('fake', () => fakeOAuthProvider);
});

/**
 * A start response's `state` and `verifier` cookies, as one `Cookie` request header — both are
 * needed to redeem a callback since PKCE landed beside the CSRF check.
 */
const attemptCookies = (start: { headers: Record<string, unknown> }): string =>
    cookieHeader(start, 'oauth_state', 'oauth_verifier');

describe('GET /account/oauth/providers', () => {
    it('lists the fake provider once it is registered', async () => {
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

    it('saves a same-origin `continue` as a cookie of its own', async () => {
        const response = await api().get('/account/oauth/fake?continue=%2Fcheckout');

        expect(setCookie(response, 'oauth_continue')).toMatch(/oauth_continue=%2Fcheckout;/);
    });

    it('saves a `locale` tag as a cookie of its own', async () => {
        const response = await api().get('/account/oauth/fake?locale=it');

        expect(setCookie(response, 'oauth_locale')).toMatch(/oauth_locale=it;/);
    });

    it('drops a `locale` that is not a tag rather than saving it', async () => {
        const response = await api().get(
            `/account/oauth/fake?locale=${encodeURIComponent('https://evil.example')}`
        );

        expect(response.status).toBe(302);
        expect(setCookie(response, 'oauth_locale')).toBeUndefined();
    });

    it.each([
        ['a protocol-relative address', '%2F%2Fevil.example'],
        ['an absolute URL', encodeURIComponent('https://evil.example/phish')],
        ['a path with no leading slash', 'checkout']
    ])('drops an invalid `continue` (%s) rather than saving it', async (_label, continueTo) => {
        const response = await api().get(`/account/oauth/fake?continue=${continueTo}`);

        expect(response.status).toBe(302);
        expect(setCookie(response, 'oauth_continue')).toBeUndefined();
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
        const stateCookie = setCookie(start, 'oauth_state')!.split(';', 1)[0];
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
        expect(setCookie(response, '__Host-jwt')).toBeTruthy();
        expect(setCookie(response, 'isAuth')).toBeTruthy();
        // No "remember me" box on a provider round trip: browser-session cookies.
        expect(setCookie(response, '__Host-jwt')).not.toMatch(/max-age=|expires=/i);
        expect(setCookie(response, 'isAuth')).not.toMatch(/max-age=|expires=/i);

        const created = await userRepository.findOne({ email: 'oauth.demo@example.com' });
        expect(created).not.toBeNull();
        expect(created?.verifiedAt).toBeInstanceOf(Date);
    });

    it('carries a saved `continue` through to the frontend redirect, and clears the cookie', async () => {
        const start = await api().get('/account/oauth/fake?continue=%2Fcheckout');
        const callbackUrl = new URL(start.headers.location);

        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', cookieHeader(start, 'oauth_state', 'oauth_verifier', 'oauth_continue'));

        expect(response.status).toBe(302);
        const location = new URL(response.headers.location);
        expect(location.searchParams.get('continue')).toBe('/checkout');
        expect(setCookie(response, 'oauth_continue')).toMatch(/oauth_continue=;/);
    });

    it('carries a saved `locale` through to the frontend redirect, and clears the cookie', async () => {
        const start = await api().get('/account/oauth/fake?locale=it');
        const callbackUrl = new URL(start.headers.location);

        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', cookieHeader(start, 'oauth_state', 'oauth_verifier', 'oauth_locale'));

        expect(response.status).toBe(302);
        const location = new URL(response.headers.location);
        expect(location.searchParams.get('locale')).toBe('it');
        expect(location.searchParams.has('continue')).toBe(false);
        expect(setCookie(response, 'oauth_locale')).toMatch(/oauth_locale=;/);
    });

    it('carries the saved `locale` on a failure redirect too, so the error page speaks it', async () => {
        const start = await api().get('/account/oauth/fake?locale=it');
        const callbackUrl = new URL(start.headers.location);
        const state = callbackUrl.searchParams.get('state');

        const response = await api()
            .get(`${callbackUrl.pathname}?state=${state}&error=access_denied`)
            .set('Cookie', cookieHeader(start, 'oauth_state', 'oauth_verifier', 'oauth_locale'));

        const location = new URL(response.headers.location);
        expect(location.searchParams.get('error')).toBe('access_denied');
        expect(location.searchParams.get('locale')).toBe('it');
    });

    it('never honors a forged `locale` cookie the start controller never validated', async () => {
        const start = await api().get('/account/oauth/fake');
        const callbackUrl = new URL(start.headers.location);

        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set(
                'Cookie',
                `${cookieHeader(start, 'oauth_state', 'oauth_verifier')}; oauth_locale=//evil.example`
            );

        expect(response.status).toBe(302);
        expect(new URL(response.headers.location).searchParams.has('locale')).toBe(false);
    });

    it('falls back to the plain landing page when no `continue` was saved', async () => {
        const response = await fakeLogin();

        const location = new URL(response.headers.location);
        expect(location.searchParams.has('continue')).toBe(false);
    });

    it('never honors a forged `continue` cookie the start controller never validated', async () => {
        const start = await api().get('/account/oauth/fake');
        const callbackUrl = new URL(start.headers.location);

        // A raw HTTP client can set any cookie it likes on the callback request directly —
        // `httpOnly` only keeps a BROWSER's own script off it, not a client that skips the
        // browser. The callback must re-validate, not trust the cookie on its name alone.
        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set(
                'Cookie',
                `${cookieHeader(start, 'oauth_state', 'oauth_verifier')}; oauth_continue=//evil.example`
            );

        expect(response.status).toBe(302);
        const location = new URL(response.headers.location);
        expect(location.searchParams.has('continue')).toBe(false);
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

    // An admin logging in through an already-linked identity is audited/metriced as an admin, not
    // a plain user: table-driven across every login path now, in `login-paths.contract.test.ts`.
});

/**
 * One full start → callback round trip through the fake provider.
 * @param continueTo - a same-origin path to request at the start, carried the whole way through.
 */
const fakeLogin = async (continueTo?: string) => {
    const query = continueTo ? `?continue=${encodeURIComponent(continueTo)}` : '';
    const start = await api().get(`/account/oauth/fake${query}`);
    const callbackUrl = new URL(start.headers.location);
    const cookies = continueTo
        ? cookieHeader(start, 'oauth_state', 'oauth_verifier', 'oauth_continue')
        : attemptCookies(start);
    return api()
        .get(callbackUrl.pathname + callbackUrl.search)
        .set('Cookie', cookies);
};

// A deactivated or soft-deleted account's already-linked identity refusing the login, with no
// session and no successful AUTH_LOGIN, is table-driven across every login path now, in
// `login-paths.contract.test.ts`.

describe('GET /account/oauth/:provider/callback — 2FA armed (1b)', () => {
    it('challenges instead of minting a session, and mints one only once the code is answered', async () => {
        // First login creates the OAuth-only account; enroll TOTP on it through its own session.
        const created = await fakeLogin();
        const refreshed = await api()
            .post('/account/refresh')
            .set('Cookie', setCookie(created, '__Host-jwt')!);
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

        // Second login: the same linked identity, now with 2FA armed. `continue` must survive
        // the MFA detour too — the frontend's 2FA step forwards it on once the code is answered.
        const challenged = await fakeLogin('/checkout');

        expect(challenged.status).toBe(302);
        const location = new URL(challenged.headers.location);
        expect(location.origin + location.pathname).toBe('http://localhost:8080/oauth/callback');
        expect(location.searchParams.get('mfaRequired')).toBe('1');
        expect(location.searchParams.get('continue')).toBe('/checkout');
        expect(location.searchParams.get('expiresAt')).toEqual(expect.any(String));
        const methods = JSON.parse(location.searchParams.get('methods')!) as { method: string }[];
        expect(methods.map((m) => m.method)).toEqual(['totp']);
        // No session — the whole point of 1b.
        expect(setCookie(challenged, '__Host-jwt')).toBeUndefined();
        expect(setCookie(challenged, 'isAuth')).toBeUndefined();
        expect(setCookie(challenged, 'oauth_mfa_challenge')).toBeTruthy();

        // The challenge token never left the server — only its cookie did. `code` alone in the
        // body, carrying the cookie, is what a real browser can actually do here.
        const finished = await api()
            .post('/account/login/2fa')
            .set('Cookie', setCookie(challenged, 'oauth_mfa_challenge')!)
            .send({ code: await codeFor(secret, 1) });

        expect(finished.status).toBe(200);
        const claims = decode(finished.body.data.token as string) as { amr?: string[] };
        expect(claims.amr).toEqual(['fake', 'otp']);
    });

    it('refuses to complete the challenge with no cookie and no challenge in the body', async () => {
        const response = await api().post('/account/login/2fa').send({ code: '000000' });

        expect(response.status).toBe(401);
    });
});
