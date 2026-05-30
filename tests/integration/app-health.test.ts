/**
 * Integration tests for /, /observability/*, and related system routes.
 * No DB or Redis is started; we mock mongoose.connection.readyState where needed.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';

import { router as systemRoutes } from '../../src/routes';
import { router as observabilityRoutes } from '../../src/routes/observability';
import { rejectResponse } from '../../src/utils/response';

const app = express();
app.use(express.json());
app.use((request, response, next) => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
});
app.use('/observability', observabilityRoutes);
app.use('/', systemRoutes);
app.use((_request, response) => rejectResponse(response, 404, 'Not Found'));

let server: Server;
let baseUrl = '';

beforeAll(
    () =>
        new Promise<void>((resolve) => {
            server = createServer(app).listen(0, '127.0.0.1', () => {
                const address = server.address() as AddressInfo;
                baseUrl = `http://127.0.0.1:${address.port}`;
                resolve();
            });
        })
);

afterAll(
    () =>
        new Promise<void>((resolve, reject) => {
            server.close((error) => {
                if (error) return reject(error);
                resolve();
            });
        })
);

describe('System routes', () => {
    it('GET / returns the welcome payload', async () => {
        const response = await fetch(`${baseUrl}/`);
        const body = (await response.json()) as { data: { status: string } };
        expect(response.status).toBe(200);
        expect(response.headers.get('x-request-id')).toBeTruthy();
        expect(body.data.status).toBe('ok');
    });

    it('returns 404 for unknown routes', async () => {
        const response = await fetch(`${baseUrl}/not-found`);
        expect(response.status).toBe(404);
    });
});

describe('Observability routes', () => {
    it('GET /observability/metrics returns prometheus exposition', async () => {
        const response = await fetch(`${baseUrl}/observability/metrics`);
        const body = await response.text();
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/plain');
        expect(body).toContain('http_requests_total');
        expect(body).toContain('process_uptime_seconds');
    });

    it('GET /observability/events returns an SSE snapshot', async () => {
        const response = await fetch(`${baseUrl}/observability/events`);
        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/event-stream');

        const reader = response.body?.getReader();
        expect(reader).toBeDefined();
        const firstChunk = await reader?.read();
        const text = new TextDecoder().decode(firstChunk?.value);
        await reader?.cancel();

        expect(text).toContain('event: observability.metrics.snapshot');
        expect(text).toContain('data: ');
    });

    it('GET /observability/health returns 401 without auth', async () => {
        const response = await fetch(`${baseUrl}/observability/health`);
        expect(response.status).toBe(401);
    });

    it('GET /observability/metrics/overview returns 401 without auth', async () => {
        const response = await fetch(`${baseUrl}/observability/metrics/overview`);
        expect(response.status).toBe(401);
    });

    it('GET /observability/audit returns 401 without auth', async () => {
        const response = await fetch(`${baseUrl}/observability/audit`);
        expect(response.status).toBe(401);
    });

    it('GET /observability/health is reachable (auth middleware is active)', async () => {
        /*
         * The 401 already confirmed auth is enforced. A full authenticated test
         * would require a signed JWT and running Redis/DB infrastructure. Instead
         * we just verify mongoose readyState is accessible and the 401 path is stable.
         */
        jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({
            readyState: 1
        } as mongoose.Connection);

        const response = await fetch(`${baseUrl}/observability/health`);
        jest.restoreAllMocks();

        /* Without valid credentials the route must return 401 — not 404 or 500. */
        expect(response.status).toBe(401);
    });
});
