/**
 * Contract tests for the system routes and the shared error envelopes.
 *
 * `GET /` was typed as `MessageResponse` while actually returning `data: { status: 'ok' }`;
 * hardening the spec surfaced that, and it is now `HealthPingEnvelope`.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api } from '@tests/http';
import { markServerListening } from '@infrastructure/runtime/readiness';
import { setEnvironment } from '@tests/environment';

setupTestDb();

describe('GET /', () => {
    it('matches the contract', async () => {
        const response = await api().get('/');

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('ok');
    });
});

describe('GET /livez', () => {
    it('matches the contract (200, empty body)', async () => {
        const response = await api().get('/livez');

        expect(response.status).toBe(200);
    });
});

describe('GET /readyz', () => {
    it('matches the contract while booting (503, empty body)', async () => {
        // Runs before `markServerListening` below — `src/app.ts`'s auto-start never fires under
        // `NODE_ENV=test`, so this file's process starts, and stays, in the 'booting' phase until
        // a test says otherwise.
        const response = await api().get('/readyz');

        expect(response.status).toBe(503);
    });

    it('matches the contract once ready (200, empty body)', async () => {
        markServerListening();

        const response = await api().get('/readyz');

        expect(response.status).toBe(200);
    });
});

describe('GET /.well-known/security.txt', () => {
    afterEach(() => {
        setEnvironment({ NODE_SECURITY_CONTACT: undefined });
        setEnvironment({ NODE_SECURITY_EXPIRES: undefined });
    });

    it('matches the contract when configured (200, text/plain)', async () => {
        setEnvironment({ NODE_SECURITY_CONTACT: 'https://example.test/advisories/new' });
        setEnvironment({ NODE_SECURITY_EXPIRES: '2099-01-01T00:00:00Z' });

        const response = await api().get('/.well-known/security.txt');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.text).toContain('Contact: https://example.test/advisories/new');
        expect(response.text).toContain('Expires: 2099-01-01T00:00:00.000Z');
    });

    it('answers 404 once its Expires has passed, though a contact is set', async () => {
        setEnvironment({ NODE_SECURITY_CONTACT: 'https://example.test/advisories/new' });
        setEnvironment({ NODE_SECURITY_EXPIRES: '2020-01-01T00:00:00Z' });

        const response = await api().get('/.well-known/security.txt');

        expect(response.status).toBe(404);
    });

    it('matches the contract when unconfigured (404)', async () => {
        const response = await api().get('/.well-known/security.txt');

        expect(response.status).toBe(404);
    });
});

describe('error envelopes', () => {
    it('matches the 404 contract for an unmatched route', async () => {
        const response = await api().get('/definitely-not-a-route');

        expect(response.status).toBe(404);
        expect(response.body.success).toBe(false);
        expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('matches the 422 contract for an invalid payload', async () => {
        const response = await api().post('/account/login').send({ email: 'not-an-email' });

        expect(response.status).toBe(422);
    });
});
