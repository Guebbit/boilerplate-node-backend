/**
 * CORS: what a disallowed origin gets.
 *
 * The regression this exists for: the disallowed branch used to answer `callback(new Error(...))`,
 * which tells the `cors` package the REQUEST failed. It threw into the express error chain and a
 * perfectly valid call — right password, right body — answered a generic 500 before its route
 * ever ran. Anyone could drive the 5xx rate with one header.
 *
 * The property being pinned is that refusing an origin is a matter of OMITTING a response header,
 * never of failing the request: the browser's same-origin policy is what withholds the body from
 * the calling page, and a curl or server-to-server caller is unaffected either way.
 *
 * Drives the real app through the shared harness, so the assertions cover the real middleware
 * order rather than a privately-assembled stack.
 *
 * See: docs/tools/security.md
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';

setupTestDb();

/**
 * The first entry of the same allowlist `src/app/security.ts` builds, read from the environment
 * rather than hardcoded — a test naming `http://localhost:8080` would start asserting the
 * fallback the moment a checkout configures `NODE_CORS_ORIGIN`, and pass for the wrong reason.
 */
const ALLOWED_ORIGIN = (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:8080').split(',')[0];

/** An origin no deployment could have allowed, whatever `NODE_CORS_ORIGIN` holds. */
const DISALLOWED_ORIGIN = 'https://evil.example.com';

describe('CORS', () => {
    it('reflects an allowed origin back to the caller', async () => {
        const response = await api().get('/').set('Origin', ALLOWED_ORIGIN);

        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(ALLOWED_ORIGIN);
    });

    /**
     * Both halves matter, and fixing only one is the plausible half-fix: the route has to still
     * answer (not 500), AND the header has to still be absent (not reflected to everyone).
     */
    it('serves a disallowed origin normally, without the allow header', async () => {
        const response = await api().get('/').set('Origin', DISALLOWED_ORIGIN);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('ok');
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    /**
     * The 500 was reachable on any endpoint, including one that would otherwise have answered a
     * deliberate status. `POST /account/login` with no body is the case the pentest hit: a real
     * rejection, which the CORS error used to replace with a generic server fault.
     */
    it('does not turn a disallowed origin into a server error on a real endpoint', async () => {
        const response = await api()
            .post('/account/login')
            .set('Origin', DISALLOWED_ORIGIN)
            .send({ email: 'nobody@example.com', password: 'wrong-password-here' });

        expect(response.status).toBeLessThan(500);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    /**
     * A caller with no `Origin` at all — curl, a healthcheck, server-to-server — is untouched.
     *
     * No allow header either, and that is correct rather than a second bug: this config reflects
     * the caller's origin, so with none sent there is nothing to reflect. A literal `*` is what
     * it must NOT answer — paired with `credentials: true` that combination is refused by every
     * browser anyway.
     */
    it('allows a request that carries no origin', async () => {
        const response = await api().get('/');

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('ok');
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    /**
     * The preflight is where a browser actually learns the answer, and it travels through the
     * same callback. `cors` short-circuits `OPTIONS` before the router, so a throw here never
     * reached a route to begin with — which is exactly why it went unnoticed.
     */
    it('answers a disallowed preflight without the allow header, and without erroring', async () => {
        const response = await api()
            .options('/account/login')
            .set('Origin', DISALLOWED_ORIGIN)
            .set('Access-Control-Request-Method', 'POST');

        expect(response.status).toBeLessThan(500);
        expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
});
