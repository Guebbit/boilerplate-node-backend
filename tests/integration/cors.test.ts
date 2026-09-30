/**
 * CORS: what a disallowed origin gets.
 *
 * The property being pinned: refusing an origin is a matter of OMITTING the CORS response header,
 * never of failing the request. Answering `callback(new Error(...))` instead would tell the
 * `cors` package the REQUEST itself failed, throwing into the express error chain and turning a
 * perfectly valid call — right password, right body — into a generic 500 before its route ever
 * ran, letting anyone drive the 5xx rate with one header. The browser's same-origin policy is
 * what withholds the body from the calling page; a curl or server-to-server caller is unaffected
 * either way.
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
const ALLOWED_ORIGIN = (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:8080').split(',', 1)[0];

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
     * The property from the file header, pinned on an endpoint that answers a deliberate status
     * of its own. `POST /account/login` with a wrong password must still answer that rejection
     * rather than a generic server fault, whatever the request's origin header says.
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

    /**
     * A header a browser will actually send has to be pre-cleared here, or the preflight refuses
     * it and the real request never leaves the browser — `humanChallengeGate`
     * (`src/infrastructure/http/middlewares/human-challenge.ts`) reads
     * `x-antibot-challenge-token`, and `callerContextOf` reads `x-analytics-consent`; neither
     * reaching the server is a silent break, not a 4xx anyone would notice here.
     */
    it('allows the antibot and analytics-consent headers through preflight', async () => {
        const response = await api()
            .options('/account/login')
            .set('Origin', ALLOWED_ORIGIN)
            .set('Access-Control-Request-Method', 'POST')
            .set(
                'Access-Control-Request-Headers',
                'x-antibot-challenge-token, x-analytics-consent'
            );

        expect(response.status).toBeLessThan(300);
        const allowedHeaders = (response.headers['access-control-allow-headers'] ?? '')
            .split(',')
            .map((header: string) => header.trim().toLowerCase());
        expect(allowedHeaders).toContain('x-antibot-challenge-token');
        expect(allowedHeaders).toContain('x-analytics-consent');
    });

    /**
     * The conditional-write pair: a browser edit form sends `If-Match` (pre-cleared here, or the
     * preflight refuses the PATCH) and must be able to READ the `ETag` it sends back (exposed
     * here, or the response header is invisible to JS).
     */
    it('lets a browser send If-Match and read ETag', async () => {
        const preflight = await api()
            .options('/products/507f1f77bcf86cd799439011')
            .set('Origin', ALLOWED_ORIGIN)
            .set('Access-Control-Request-Method', 'PATCH')
            .set('Access-Control-Request-Headers', 'if-match');
        const read = await api().get('/').set('Origin', ALLOWED_ORIGIN);

        expect(preflight.headers['access-control-allow-headers']?.toLowerCase()).toContain(
            'if-match'
        );
        expect(read.headers['access-control-expose-headers']?.toLowerCase()).toContain('etag');
    });
});
