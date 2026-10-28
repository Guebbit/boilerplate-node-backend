/**
 * @module
 * Contract tests for /antibot (`GET /config` has its own, in `tests/contract/config.contract.test.ts`), plus the end-to-end proof that a selected provider actually gates
 * a guarded route. That second half belongs here rather than in `tickets`'s own suite: `antibot`
 * is the one module that knows both halves of the handshake — what the client is told to render
 * and what counts as a token — without importing the routes it guards.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { setEnvironment } from '@tests/environment';

setupTestDb();

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

describe('the gate it guards, end to end on one guarded route', () => {
    const CONTACT_PAYLOAD = {
        email: 'ada@example.com',
        subject: 'Broken checkout',
        message: 'The checkout button does nothing on mobile.'
    };

    it('lets the guarded route through untouched while the provider is `none`', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: undefined });

        const response = await api().post('/tickets').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(201);
    });

    it('refuses the guarded route with no token once a provider is selected', async () => {
        setEnvironment({ NODE_ANTIBOT_PROVIDER: 'turnstile' });

        const response = await api().post('/tickets').send(CONTACT_PAYLOAD);

        expect(response.status).toBe(403);
    });
});
