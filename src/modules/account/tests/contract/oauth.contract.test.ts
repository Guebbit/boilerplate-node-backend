/**
 * @module
 * Contract tests for the OAuth surface: `GET /account/oauth/providers`, and the full
 * start → callback round trip through the `fake` provider (`NODE_DEMO=true`) — the same path a
 * Cypress spec walks against a real browser, exercised here against the real routes, the real CSRF
 * cookie, and a real database.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { userRepository } from '@modules/users';

setupTestDb();

const originalDemo = process.env.NODE_DEMO;
beforeAll(() => {
    process.env.NODE_DEMO = 'true';
});
afterAll(() => {
    if (originalDemo === undefined) delete process.env.NODE_DEMO;
    else process.env.NODE_DEMO = originalDemo;
});

/** One named cookie's full `Set-Cookie` value, or `undefined` if the response set none by that name. */
const setCookie = (
    response: { headers: Record<string, unknown> },
    name: string
): string | undefined => {
    const raw = response.headers['set-cookie'] ?? [];
    const cookies = Array.isArray(raw) ? raw : [raw as string];
    return cookies.find((cookie) => cookie.startsWith(`${name}=`));
};

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

    it('redirects to the consent step and sets the CSRF state cookie', async () => {
        const response = await api().get('/account/oauth/fake');

        expect(response.status).toBe(302);
        expect(response.headers.location).toContain('/account/oauth/fake/callback');
        expect(setCookie(response, 'oauth_state')).toBeTruthy();
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

    it('completes the round trip: session cookies set, user created, redirected to the frontend', async () => {
        const start = await api().get('/account/oauth/fake');
        const stateCookie = setCookie(start, 'oauth_state')!;
        const callbackUrl = new URL(start.headers.location);

        const response = await api()
            .get(callbackUrl.pathname + callbackUrl.search)
            .set('Cookie', stateCookie);

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('http://localhost:8080/oauth/callback');
        expect(setCookie(response, 'jwt')).toBeTruthy();
        expect(setCookie(response, 'isAuth')).toBeTruthy();

        const created = await userRepository.findOne({ email: 'oauth.demo@example.com' });
        expect(created).not.toBeNull();
        expect(created?.verified).toBe(true);
    });

    it('logs the SAME account in on a second attempt rather than creating another one', async () => {
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const start = await api().get('/account/oauth/fake');
            const stateCookie = setCookie(start, 'oauth_state')!;
            const callbackUrl = new URL(start.headers.location);
            // Sequential on purpose: the second attempt only matters once the first has actually
            // landed — running them concurrently would test a race, not this.
            await api()
                .get(callbackUrl.pathname + callbackUrl.search)
                .set('Cookie', stateCookie);
        }

        const matches = await userRepository.count({ email: 'oauth.demo@example.com' });
        expect(matches).toBe(1);
    });
});
