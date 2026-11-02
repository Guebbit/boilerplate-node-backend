/**
 * Contract tests for `GET /config` — the one public answer a client boots from: the session config
 * and the OAuth providers (`account`) with the human-challenge config (`antibot`). Each piece keeps
 * its own owner; what is pinned here is that they arrive together, public and briefly cacheable.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setEnvironment } from '@tests/environment';
import { registerOAuthProvider } from '@modules/account/oauth/providers';
import { fakeOAuthProvider } from '@scenarios/support/doubles/oauth-fake';

setupTestDb();

describe('GET /config', () => {
    it('answers every piece with no credential, while every rung is off — the default', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: undefined });

        const response = await api().get('/config');

        expect(response.status).toBe(200);
        expect(response.body.antibot).toEqual({
            provider: 'none',
            parameters: {},
            rungs: { identityBudgets: true, emailPolicy: 'off' }
        });
        expect(response.body.session.mode).toBeDefined();
        expect(response.body.session.lifetimeSeconds).toEqual({
            short: expect.any(Number),
            medium: expect.any(Number),
            long: expect.any(Number)
        });
        expect(Array.isArray(response.body.oauthProviders)).toBe(true);
    });

    it('lists an OAuth provider once it is registered', async () => {
        registerOAuthProvider('fake', () => fakeOAuthProvider);

        const response = await api().get('/config');

        expect(response.body.oauthProviders).toContain('fake');
    });

    it('publishes the selected provider and its public parameters', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });
        setEnvironment({ NODE_ANTIBOT_TURNSTILE_SITE_KEY: 'site-key-for-the-browser' });

        const response = await api().get('/config');

        expect(response.body.antibot.provider).toBe('turnstile');
        expect(response.body.antibot.parameters.siteKey).toBe('site-key-for-the-browser');
    });

    it("publishes rung 2's active posture alongside rung 3's provider", async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'mx' });

        const response = await api().get('/config');

        expect(response.body.antibot.rungs).toEqual({ identityBudgets: true, emailPolicy: 'mx' });
    });

    it('is publicly cacheable for a short while, since nothing in it is live per request', async () => {
        const response = await api().get('/config');

        expect(response.headers['cache-control']).toBe('public, max-age=60');
    });

    it('answers 500 rather than falling back when the provider name is unknown, and is not cacheable', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'not-a-provider' });

        const response = await api().get('/config');

        expect(response.status).toBe(500);
        expect(response.headers['cache-control']).toBe('no-store');
    });

    it('answers 500 rather than falling back when the email policy is unknown', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'not-a-policy' });

        const response = await api().get('/config');

        expect(response.status).toBe(500);
    });
});
