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
        expect(response.body.data.status).toBe('ok');
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

describe('GET /livez', () => {
    // Runs before `GET /readyz`'s cases below, so the process is still booting here: the property
    // that defines liveness is that it does not care.
    it('answers 200 with an empty body while /readyz still answers 503', async () => {
        const ready = await api().get('/readyz');
        const live = await api().get('/livez');

        expect(ready.status).toBe(503);
        expect(live.status).toBe(200);
        expect(live.text).toBe('');
    });
});

describe('GET /readyz', () => {
    // `src/app.ts`'s auto-start is skipped under `NODE_ENV=test` (see `tests/support/http.ts`'s
    // own docblock), so this process never calls `markServerListening` on its own — every case
    // below drives the phase directly instead. The 'still booting' case must run first: it is the
    // one case this file does not itself set up, and would otherwise pass by accident after a
    // later case marks the process listening.
    it('answers 503 with an empty body while still booting', async () => {
        const response = await api().get('/readyz');

        expect(response.status).toBe(503);
        expect(response.body).toEqual({});
        expect(response.text).toBe('');
    });

    it('answers 200 with an empty body once listening, database included', async () => {
        markServerListening();

        const response = await api().get('/readyz');

        expect(response.status).toBe(200);
        expect(response.text).toBe('');
    });

    it('answers 503 again once draining starts, even though the database is still up', async () => {
        markServerDraining();

        const response = await api().get('/readyz');

        expect(response.status).toBe(503);
    });

    it('leaves /livez at 200 while draining: a shutdown is not a reason to restart', async () => {
        const response = await api().get('/livez');

        expect(response.status).toBe(200);
    });
});
