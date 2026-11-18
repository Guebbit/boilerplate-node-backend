/**
 * A known path asked with the wrong method answers 405 + `Allow`, through the real app; an
 * unknown path is still a 404, and the preflight and HEAD keep working (RFC 9110 §15.5.6).
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { listOperations, type HttpMethod, type Operation } from '@tests/spec-walk';
import { buildUrl, seedWorld } from '@tests/spec-world';
import { authenticateAs } from '@tests/http';

setupTestDb();

/** The first origin the deployment allows, as `cors.test.ts` reads it. */
const ALLOWED_ORIGIN = (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:8080').split(',', 1)[0];

describe('a wrong method on a known path', () => {
    it('answers 405 with Allow and the METHOD_NOT_ALLOWED code', async () => {
        const response = await api().delete('/shop');

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
        expect(response.body.errors[0].code).toBe('METHOD_NOT_ALLOWED');
        expect(response.type).toBe('application/problem+json');
        expect(response.body).toMatchObject({ title: 'Method Not Allowed', status: 405 });
    });

    it('answers 405 on a literal path that a templated sibling would otherwise catch', async () => {
        // `/products/{id}` also reads `facets` as an id: without the pre-router guard this is a 404.
        const response = await api().delete('/products/facets');

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
    });

    it('answers 405 on a system route too', async () => {
        const response = await api().post('/livez');

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
    });
});

/** Every verb the spec can declare an operation under. */
const ALL_METHODS: HttpMethod[] = ['get', 'post', 'put', 'patch', 'delete'];

/**
 * One row per path the spec declares: the operation that names it, and the methods it declares.
 * Derived from the spec, so a path added tomorrow is swept with no list to update.
 */
const PATHS = [...new Set(listOperations().map((operation) => operation.path))].map(
    (route): [string, Operation, HttpMethod[]] => {
        const operations = listOperations().filter((operation) => operation.path === route);
        return [route, operations[0], operations.map((operation) => operation.method)];
    }
);

describe('every path of the spec, asked with every method it does not declare', () => {
    it('walks some paths', () => {
        // A walk that found nothing would pass the sweep below by testing nothing.
        expect(PATHS.length).toBeGreaterThan(40);
    });

    it.each(PATHS)(
        '%s answers 405 + Allow for each undeclared method',
        async (_route, operation, declared) => {
            // As admin: a router-level auth guard answers an anonymous caller 401 before the 405 guard runs.
            const { user, bearer } = await authenticateAs('admin');
            const url = buildUrl(operation, await seedWorld(user));
            // HEAD rides on GET, and OPTIONS is listed wherever the path has any method (the guard's rule).
            const allow = [
                ...declared.map((method) => method.toUpperCase()),
                ...(declared.includes('get') ? ['HEAD'] : []),
                'OPTIONS'
            ]
                .toSorted()
                .join(', ');

            for (const method of ALL_METHODS.filter((candidate) => !declared.includes(candidate))) {
                const response = await api()[method](url).set('Authorization', bearer);

                expect([method, response.status]).toEqual([method, 405]);
                expect(response.headers.allow).toBe(allow);
            }
        },
        60_000
    );
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
        expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
        expect(response.headers['accept-patch']).toBeUndefined();
    });

    it('lets a literal path win over its templated sibling', async () => {
        const response = await api().options('/products/facets');

        expect(response.headers.allow).toBe('GET, HEAD, OPTIONS');
        expect(response.headers['accept-patch']).toBeUndefined();
    });

    it('lets a literal sub-path win over a templated sibling under the same parent', async () => {
        const response = await api().options('/payments/abc/refunds/sync');

        expect(response.headers.allow).toBe('OPTIONS, POST');
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

describe('Allow lists OPTIONS itself, on both answers', () => {
    it('lists OPTIONS on the OPTIONS 204 and on a 405, the same set', async () => {
        const options = await api().options('/shop');
        const refused = await api().delete('/shop');

        expect(options.status).toBe(204);
        expect(refused.status).toBe(405);
        expect(options.headers.allow).toBe('GET, HEAD, OPTIONS');
        expect(refused.headers.allow).toBe(options.headers.allow);
    });
});
