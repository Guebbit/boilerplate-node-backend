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
import type { IncomingMessage } from 'node:http';
import { api } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/factory';

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
});

describe('Observability routes', () => {
    it('GET /observability/metrics returns prometheus exposition', async () => {
        // Prometheus scrapes it with a static bearer credential, since it cannot log in or hold
        // a session. See `isMetricsScraper`.
        const response = await api()
            .get('/observability/metrics')
            .set('Authorization', `Bearer ${process.env.NODE_METRICS_TOKEN ?? ''}`);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toContain('text/plain');
        expect(response.text).toContain('http_requests_total');
        expect(response.text).toContain('process_uptime_seconds');
    });

    it('GET /observability/events returns an SSE snapshot', async () => {
        // supertest buffers the whole response, so the stream is read by aborting shortly after
        // the first chunk lands rather than by holding the connection open.
        // `EventSource` cannot set headers, so the stream authenticates with the session cookie
        // an admin login sets — which is how the frontend opens it (`withCredentials: true`).
        const admin = await createAdminUser({ email: 'sse-admin@example.com' });
        const login = await api()
            .post('/account/login')
            .send({ email: admin.email, password: PLAIN_PASSWORD });
        const cookie = (login.get('Set-Cookie') ?? []).find((value) => value.startsWith('jwt='))!;

        const response = await api()
            .get('/observability/events')
            .set('Cookie', cookie)
            .buffer(true)
            .parse((res: unknown, callback) => {
                const stream = res as IncomingMessage;
                let text = '';
                let settled = false;
                const finish = () => {
                    if (settled) return;
                    settled = true;
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
