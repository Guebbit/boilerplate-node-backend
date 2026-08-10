/**
 * Contract tests for the system routes and the shared error envelopes.
 *
 * `GET /` was typed as `MessageResponse` while actually returning `data: { status: 'ok' }`;
 * hardening the spec surfaced that, and it is now `HealthPingEnvelope`.
 */
import '../helpers/contract';
import { setupTestDb } from '../helpers/setup-test-db';
import { api } from '../helpers/http';

setupTestDb();

describe('GET /', () => {
    it('matches the contract', async () => {
        const response = await api().get('/');

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('ok');
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
    });
});
