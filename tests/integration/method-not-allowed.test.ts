/**
 * A known path asked with the wrong method answers 405 + `Allow`, through the real app; an
 * unknown path is still a 404, and the preflight and HEAD keep working (RFC 9110 §15.5.6).
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

/** The first origin the deployment allows, as `cors.test.ts` reads it. */
const ALLOWED_ORIGIN = (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:8080').split(',', 1)[0];

describe('a wrong method on a known path', () => {
    it('answers 405 with Allow and the METHOD_NOT_ALLOWED code', async () => {
        const response = await api().delete('/shop');

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET, HEAD');
        expect(response.body.errors[0].code).toBe('METHOD_NOT_ALLOWED');
        expect(response.body.success).toBe(false);
    });

    it('answers 405 on a system route too', async () => {
        const response = await api().post('/livez');

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET, HEAD');
    });
});

describe('what stays as it was', () => {
    it('answers 404 for a path the contract does not know', async () => {
        const read = await api().get('/nope');
        const write = await api().delete('/nope');

        expect(read.status).toBe(404);
        expect(write.status).toBe(404);
    });

    it('answers a preflight OPTIONS 204 for an allowed origin', async () => {
        const response = await api()
            .options('/shop')
            .set('Origin', ALLOWED_ORIGIN)
            .set('Access-Control-Request-Method', 'GET');

        expect(response.status).toBe(204);
    });

    it('answers HEAD through the GET route', async () => {
        const response = await api().head('/livez');

        expect(response.status).toBe(200);
    });
});
