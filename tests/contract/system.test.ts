/**
 * Contract tests for the system routes and the shared error documents.
 *
 * `GET /` answers `{ status: 'ok' }`, declared as `HealthPing`.
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
        expect(response.body.status).toBe('ok');
    });
});

describe('GET /livez', () => {
    it('matches the contract (200, empty body)', async () => {
        const response = await api().get('/livez');

        expect(response.status).toBe(200);
    });
});

describe('GET /readyz', () => {
    // One case walks booting then ready: `src/app.ts`'s auto-start never fires under
    // `NODE_ENV=test`, so this file's process starts in 'booting', and the phase only moves
    // forward. Separate cases would pass only in file order.
    it('matches the contract while booting (503) and once ready (200), empty body both times', async () => {
        const booting = await api().get('/readyz');

        expect(booting.status).toBe(503);

        markServerListening();
        const ready = await api().get('/readyz');

        expect(ready.status).toBe(200);
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
        expect(response.type).toBe('application/problem+json');
        expect(response.body).toMatchObject({
            type: 'about:blank',
            title: 'Not Found',
            status: 404
        });
        expect(Array.isArray(response.body.errors)).toBe(true);
    });

    it('matches the 422 contract for an invalid payload', async () => {
        const response = await api().post('/account/login').send({ email: 'not-an-email' });

        expect(response.status).toBe(422);
    });
});
