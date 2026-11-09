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
        expect(response.type).toBe('application/problem+json');
        expect(response.body).toMatchObject({ title: 'Method Not Allowed', status: 405 });
    });

    it('answers 405 on a literal path that a templated sibling would otherwise catch', async () => {
        // `/products/{id}` also reads `facets` as an id: without the pre-router guard this is a 404.
        const response = await api().delete('/products/facets');

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET, HEAD');
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

describe('OPTIONS says what a path accepts', () => {
    it('answers Allow and Accept-Patch where the path has a PATCH', async () => {
        const response = await api().options('/products/some-id');

        expect(response.status).toBe(204);
        expect(response.headers.allow).toContain('PATCH');
        expect(response.headers['accept-patch']).toContain('application/merge-patch+json');
    });

    it('answers no Accept-Patch where the path has no PATCH', async () => {
        const response = await api().options('/shop');

        expect(response.status).toBe(204);
        expect(response.headers.allow).toBe('GET, HEAD');
        expect(response.headers['accept-patch']).toBeUndefined();
    });

    it('lets a literal path win over its templated sibling', async () => {
        const response = await api().options('/products/facets');

        expect(response.headers.allow).toBe('GET, HEAD');
        expect(response.headers['accept-patch']).toBeUndefined();
    });

    it('sends no Content-Length on the 204', async () => {
        const response = await api().options('/shop');

        expect(response.headers['content-length']).toBeUndefined();
    });

    it('answers the same Allow for a refused, an allowed and an absent Origin', async () => {
        const refused = await api().options('/shop').set('Origin', 'http://evil.example');
        const allowed = await api().options('/shop').set('Origin', ALLOWED_ORIGIN);
        const absent = await api().options('/shop');

        expect([refused.status, allowed.status, absent.status]).toEqual([204, 204, 204]);
        expect(refused.headers.allow).toBe(absent.headers.allow);
        expect(allowed.headers.allow).toBe(absent.headers.allow);
        expect(refused.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('keeps the preflight headers on a real preflight', async () => {
        const response = await api()
            .options('/shop')
            .set('Origin', ALLOWED_ORIGIN)
            .set('Access-Control-Request-Method', 'GET');

        expect(response.headers['access-control-allow-methods']).toContain('PATCH');
        expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    it('answers a plain OPTIONS on an unknown path 404, and a preflight there 204', async () => {
        const plain = await api().options('/nope');
        const preflight = await api()
            .options('/nope')
            .set('Origin', ALLOWED_ORIGIN)
            .set('Access-Control-Request-Method', 'GET');

        expect(plain.status).toBe(404);
        expect(plain.headers.allow).toBeUndefined();
        expect(preflight.status).toBe(204);
    });
});
