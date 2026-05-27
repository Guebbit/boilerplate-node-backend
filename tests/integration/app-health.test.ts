/**
 * Integration tests for /healthz, /readyz, / and /metrics.
 * No DB or Redis is started; we mock mongoose.connection.readyState and pingCache.
 */
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import mongoose from 'mongoose';

jest.mock('@utils/cache', () => ({
    // eslint-disable-next-line @typescript-eslint/naming-convention
    __esModule: true,
    pingCache: jest.fn().mockResolvedValue(true)
}));

import { router as systemRoutes } from '../../src/routes';
import { rejectResponse } from '../../src/utils/response';
import { pingCache } from '../../src/utils/cache';

const app = express();
app.use(express.json());
app.use((request, response, next) => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
});
app.use('/', systemRoutes);
app.use((_request, response) => rejectResponse(response, 404, 'Not Found'));

let server: Server;
let baseUrl = '';
const mockedPingCache = pingCache as jest.MockedFunction<typeof pingCache>;

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

    it('GET /healthz always returns 200', async () => {
        const response = await fetch(`${baseUrl}/healthz`);
        const body = (await response.json()) as { data: { status: string } };
        expect(response.status).toBe(200);
        expect(body.data.status).toBe('ok');
    });

    it('GET /readyz returns 200 when mongo and redis are up', async () => {
        jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({
            readyState: 1
        } as mongoose.Connection);
        mockedPingCache.mockResolvedValueOnce(true);

        const response = await fetch(`${baseUrl}/readyz`);
        const body = (await response.json()) as { data: { mongo: string; redis: string } };
        expect(response.status).toBe(200);
        expect(body.data.mongo).toBe('up');
        expect(body.data.redis).toBe('up');
    });

    it('GET /readyz returns 503 when mongo is down', async () => {
        jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({
            readyState: 0
        } as mongoose.Connection);
        mockedPingCache.mockResolvedValueOnce(true);

        const response = await fetch(`${baseUrl}/readyz`);
        expect(response.status).toBe(503);
    });

    it('GET /readyz returns 503 when redis is down', async () => {
        jest.spyOn(mongoose, 'connection', 'get').mockReturnValue({
            readyState: 1
        } as mongoose.Connection);
        mockedPingCache.mockResolvedValueOnce(false);

        const response = await fetch(`${baseUrl}/readyz`);
        expect(response.status).toBe(503);
    });

    it('returns 404 for unknown routes', async () => {
        const response = await fetch(`${baseUrl}/not-found`);
        expect(response.status).toBe(404);
    });

    it('GET /metrics returns prometheus exposition', async () => {
        const response = await fetch(`${baseUrl}/metrics`);
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
});
