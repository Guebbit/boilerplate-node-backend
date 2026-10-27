/**
 * Integration tests for `/` and `/observability/*`.
 *
 * These drive the **real** application from `src/app.ts` through the shared supertest harness,
 * never a privately-assembled express app — that would risk passing against a middleware stack
 * the real app does not have.
 *
 * Redis is not started: the routes exercised here do not need it. A database IS, since
 * `/observability/events` authenticates with an admin session cookie and a session needs a user
 * to belong to.
 */
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { markServerListening, markServerDraining } from '@infrastructure/runtime/readiness';
import { logger } from '@infrastructure/adapters/logger';
import { setEnvironment } from '@tests/environment';

setupTestDb();

describe('System routes', () => {
    it('GET / returns the welcome payload', async () => {
        const response = await api().get('/');

        expect(response.status).toBe(200);
        expect(response.headers['x-request-id']).toBeTruthy();
        expect(response.body.status).toBe('ok');
    });

    it('returns 404 for unknown routes', async () => {
        const response = await api().get('/not-found');

        expect(response.status).toBe(404);
    });

    // The id this service answers with is always one it chose: a client-supplied value is kept
    // beside it as `clientRequestId`, never adopted — see request-context.ts.
    it('answers with its own request id and logs the client one beside it', async () => {
        const clientId = '4f9c9a10-2b3e-4d5c-8f1a-0e6b7c8d9e10';
        const log = jest.spyOn(logger, 'log').mockImplementation(() => logger);

        const response = await api().get('/').set('x-request-id', clientId);
        const accessLog = log.mock.calls.find(([, message]) => message.startsWith('GET /'));
        log.mockRestore();

        expect(response.headers['x-request-id']).not.toBe(clientId);
        expect(accessLog?.[2]).toMatchObject({
            requestId: response.headers['x-request-id'],
            clientRequestId: clientId
        });
    });

    it('adopts the client request id behind a trusted ingress', async () => {
        setEnvironment({ NODE_TRUSTED_INGRESS: 'true' });
        const clientId = '4f9c9a10-2b3e-4d5c-8f1a-0e6b7c8d9e10';

        const response = await api().get('/').set('x-request-id', clientId);

        expect(response.headers['x-request-id']).toBe(clientId);
    });

    it('replaces a malformed x-request-id rather than reflecting it', async () => {
        // Node's http client already refuses a literal CR/LF in a header value, so this asserts
        // against an ordinary non-UUID string — the shape check is what closes the log-injection
        // gap for values a client CAN actually send, long/odd ones included.
        const response = await api().get('/').set('x-request-id', 'not-a-uuid');

        expect(response.headers['x-request-id']).not.toBe('not-a-uuid');
        expect(response.headers['x-request-id']).toMatch(
            /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i
        );
    });
});

describe('GET /livez and GET /readyz across the process lifecycle', () => {
    // The phase only moves forward (`readiness.ts`), and `src/app.ts`'s auto-start is skipped under
    // `NODE_ENV=test` (see `tests/support/http.ts`'s own docblock), so this process starts in
    // 'booting' and never calls `markServerListening` on its own. One case walks the whole path,
    // because separate cases would pass only in file order, and the suite also runs shuffled.
    it('answers 503 booting, 200 listening, 503 draining, while /livez stays 200 with an empty body', async () => {
        const booting = await api().get('/readyz');
        // Liveness does not care that the process is still booting.
        const liveWhileBooting = await api().get('/livez');

        expect(booting.status).toBe(503);
        expect(booting.body).toEqual({});
        expect(booting.text).toBe('');
        expect(liveWhileBooting.status).toBe(200);
        expect(liveWhileBooting.text).toBe('');

        markServerListening();
        const listening = await api().get('/readyz');

        expect(listening.status).toBe(200);
        expect(listening.text).toBe('');

        markServerDraining();
        const draining = await api().get('/readyz');
        // A shutdown is not a reason to restart, so liveness holds while draining.
        const liveWhileDraining = await api().get('/livez');

        expect(draining.status).toBe(503);
        expect(liveWhileDraining.status).toBe(200);
    });
});
