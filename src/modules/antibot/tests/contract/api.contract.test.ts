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

setupTestDb();

/** Saved so the rungs these cases turn on are restored for every other suite. */
const ORIGINAL_PROVIDER = process.env.NODE_ANTIBOT_PROVIDER;

/** Likewise for rung 2 — `GET /antibot/config` reports both, so both are steered here. */
const ORIGINAL_EMAIL_POLICY = process.env.NODE_ANTIBOT_EMAIL_POLICY;

afterEach(() => {
    if (ORIGINAL_PROVIDER === undefined) delete process.env.NODE_ANTIBOT_PROVIDER;
    else process.env.NODE_ANTIBOT_PROVIDER = ORIGINAL_PROVIDER;
    if (ORIGINAL_EMAIL_POLICY === undefined) delete process.env.NODE_ANTIBOT_EMAIL_POLICY;
    else process.env.NODE_ANTIBOT_EMAIL_POLICY = ORIGINAL_EMAIL_POLICY;
});

describe('GET /antibot/config', () => {
    it('matches the contract while every rung is off — the default', async () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;
        delete process.env.NODE_ANTIBOT_EMAIL_POLICY;

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({
            provider: 'none',
            parameters: {},
            rungs: { identityBudgets: true, emailPolicy: 'off' }
        });
        expect(response).toSatisfyApiSpec();
    });

    it('publishes the selected provider and its public parameters', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';
        process.env.NODE_ANTIBOT_TURNSTILE_SITE_KEY = 'site-key-for-the-browser';

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(200);
        expect(response.body.data.provider).toBe('turnstile');
        expect(response.body.data.parameters.siteKey).toBe('site-key-for-the-browser');
        expect(response).toSatisfyApiSpec();
    });

    it("publishes rung 2's active posture alongside rung 3's provider", async () => {
        process.env.NODE_ANTIBOT_EMAIL_POLICY = 'mx';

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(200);
        expect(response.body.data.rungs).toEqual({ identityBudgets: true, emailPolicy: 'mx' });
        expect(response).toSatisfyApiSpec();
    });

    it('answers 500 rather than falling back when the provider name is unknown', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'not-a-provider';

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(500);
        expect(response).toSatisfyApiSpec();
    });

    it('answers 500 rather than falling back when the email policy is unknown', async () => {
        process.env.NODE_ANTIBOT_EMAIL_POLICY = 'not-a-policy';

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(500);
        expect(response).toSatisfyApiSpec();
    });
});

describe('the gate it guards, end to end on one guarded route', () => {
    const CONTACT_PAYLOAD = {
        email: 'ada@example.com',
        subject: 'Broken checkout',
        message: 'The checkout button does nothing on mobile.'
    };

    it('lets the guarded route through untouched while the provider is `none`', async () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;

        const response = await api().post('/feedback/contact').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
    });

    it('refuses the guarded route with no token once a provider is selected', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'turnstile';

        const response = await api().post('/feedback/contact').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
