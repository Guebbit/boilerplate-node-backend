/**
 * @module
 * Contract tests for the OAuth surface: `GET /account/oauth/providers`, and the full
 * start → callback round trip through the `fake` provider (`enableDemoProfile()`) — the same path
 * a Cypress spec walks against a real browser, exercised here against the real routes, the real
 * CSRF cookie, and a real database.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setCookie, cookieHeader } from '@tests/cookies';
import { userRepository } from '@modules/users';
import { enableDemoProfile } from '@infrastructure/adapters/demo-outbox';

setupTestDb();

/** So the fake provider these cases need is switched off again for every other suite. */
beforeAll(() => {
    enableDemoProfile();
});
afterAll(() => {
    enableDemoProfile(false);
});

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
});
