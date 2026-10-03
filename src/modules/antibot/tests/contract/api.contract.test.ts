/**
 * @module
 * Contract tests for /antibot, plus the end-to-end proof that a selected provider actually gates
 * a guarded route. That second half belongs here rather than in `feedback`'s own suite: `antibot`
 * is the one module that knows both halves of the handshake — what the client is told to render
 * and what counts as a token — without importing the routes it guards.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setEnvironment } from '@tests/environment';

setupTestDb();

/** Saved so the rungs these cases turn on are restored for every other suite. */

/** Likewise for rung 2 — `GET /antibot/config` reports both, so both are steered here. */

describe('GET /antibot/challenge', () => {
    /** Saved so the self-hosted provider's secret does not leak into other suites. */

    it('matches the contract for the self-hosted provider: a challenge to solve', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'altcha' });
        setEnvironment({ NODE_ANTIBOT_ALTCHA_SECRET: 'contract-test-altcha-secret' });

        const response = await api().get('/antibot/challenge');

        expect(response.status).toBe(200);
    });

    it('answers 404 when no provider this server hosts is selected — the default', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });

        const response = await api().get('/antibot/challenge');

        expect(response.status).toBe(404);
    });

    it('answers 404 for a vendor-hosted provider, which issues its challenges itself', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });

        const response = await api().get('/antibot/challenge');

        expect(response.status).toBe(404);
    });
});

describe('GET /antibot/config', () => {
    it('matches the contract while every rung is off — the default', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: undefined });

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            provider: 'none',
            parameters: {},
            rungs: { identityBudgets: true, emailPolicy: 'off' }
        });
    });

    it('publishes the selected provider and its public parameters', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });
        setEnvironment({ NODE_ANTIBOT_TURNSTILE_SITE_KEY: 'site-key-for-the-browser' });

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(200);
        expect(response.body.data.provider).toBe('turnstile');
        expect(response.body.data.parameters.siteKey).toBe('site-key-for-the-browser');
    });

    it("publishes rung 2's active posture alongside rung 3's provider", async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'mx' });

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(200);
        expect(response.body.data.rungs).toEqual({ identityBudgets: true, emailPolicy: 'mx' });
    });

    it('answers 500 rather than falling back when the provider name is unknown', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'not-a-provider' });

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(500);
    });

    it('answers 500 rather than falling back when the email policy is unknown', async () => {
        setEnvironment({ NODE_ANTIBOT_EMAIL_POLICY: 'not-a-policy' });

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(500);
    });
});

describe('the gate it guards, end to end on one guarded route', () => {
    const CONTACT_PAYLOAD = {
        email: 'ada@example.com',
        subject: 'Broken checkout',
        message: 'The checkout button does nothing on mobile.'
    };

    it('lets the guarded route through untouched while the provider is `none`', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });

        const response = await api().post('/feedback/contact').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(201);
    });

    it('refuses the guarded route with no token once a provider is selected', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });

        const response = await api().post('/feedback/contact').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(401);
    });
});
