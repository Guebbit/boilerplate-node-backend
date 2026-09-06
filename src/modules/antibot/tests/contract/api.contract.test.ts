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

const ORIGINAL_PROVIDER = process.env.NODE_ANTIBOT_PROVIDER;

afterEach(() => {
    if (ORIGINAL_PROVIDER === undefined) delete process.env.NODE_ANTIBOT_PROVIDER;
    else process.env.NODE_ANTIBOT_PROVIDER = ORIGINAL_PROVIDER;
});

describe('GET /antibot/config', () => {
    it('matches the contract while the rung is off — the default', async () => {
        delete process.env.NODE_ANTIBOT_PROVIDER;

        const response = await api().get('/antibot/config');

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ provider: 'none', parameters: {} });
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

    it('answers 500 rather than falling back when the provider name is unknown', async () => {
        process.env.NODE_ANTIBOT_PROVIDER = 'not-a-provider';

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
