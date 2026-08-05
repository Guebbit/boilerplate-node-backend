/**
 * Integration tests for `/` and `/observability/*`.
 *
 * These drive the **real** application from `src/app.ts` through the shared supertest harness.
 * They used to assemble a private express app from two routers plus a hand-copied request-id
 * middleware, because importing `src/app.ts` failed to compile under the jest tsconfig. That
 * blocker is gone (the mailer no longer uses `import.meta`, and `tsconfig.jest.json` resolves
 * subpath exports), so the duplicate app is gone with it — along with the risk of these tests
 * passing against a middleware stack the real app does not have.
 *
 * No DB or Redis is started: the routes exercised here need neither, and the auth middleware
 * answers 401 for unauthenticated requests without touching the database.
 */
import type { IncomingMessage } from 'node:http';
import { api } from '../helpers/http';

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
});

describe('Observability routes', () => {
    it('GET /observability/metrics returns prometheus exposition', async () => {
        const response = await api().get('/observability/metrics');

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.text).toContain('http_requests_total');
        expect(response.text).toContain('process_uptime_seconds');
    });

    it('GET /observability/events returns an SSE snapshot', async () => {
        // supertest buffers the whole response, so the stream is read by aborting shortly after
        // the first chunk lands rather than by holding the connection open.
        const response = await api()
            .get('/observability/events')
            .buffer(true)
            .parse((res, callback) => {
                const stream = res as unknown as IncomingMessage;
                let text = '';
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
                    // eslint-disable-next-line unicorn/no-null -- superagent's callback contract
                    callback(null, text);
                };
                stream.on('data', (chunk: Buffer) => {
                    text += chunk.toString();
                    // The endpoint streams indefinitely; stop as soon as the first event lands,
                    // otherwise supertest waits for an end that never comes.
                    if (text.includes('data: ')) stream.destroy();
                });
                stream.on('close', finish);
                stream.on('end', finish);
            });

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/event-stream');
        expect(response.body).toContain('event: observability.metrics.snapshot');
        expect(response.body).toContain('data: ');
    });

    // Each of these must answer 401 rather than 404 or 500 — that is what proves the auth
    // middleware is mounted on the path at all, not merely that the path is unreachable.
    it.each(['/observability/health', '/observability/metrics/overview', '/observability/audit'])(
        'GET %s returns 401 without auth',
        async (path) => {
            const response = await api().get(path);

            expect(response.status).toBe(401);
        }
    );
});
