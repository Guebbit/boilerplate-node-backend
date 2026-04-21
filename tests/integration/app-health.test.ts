import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import crypto from 'node:crypto';
import express from 'express';
import { router as systemRoutes } from '../../src/routes';
import { rejectResponse } from '../../src/utils/response';
import {
    createTraceContext,
    getRouteLabel,
    recordRequestMetric,
    toTraceparentHeader
} from '../../src/utils/observability';

const app = express();
app.use(express.json());
app.use((request, response, next) => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
});
app.use((request, response, next) => {
    const traceContext = createTraceContext(request.get('traceparent'));
    request.traceContext = traceContext;
    response.setHeader('traceparent', toTraceparentHeader(traceContext));
    response.setHeader('x-trace-id', traceContext.traceId);
    next();
});
app.use((request, response, next) => {
    const startedAt = process.hrtime.bigint();
    response.once('finish', () => {
        const elapsedTimeInMilliseconds = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
        recordRequestMetric({
            method: request.method,
            route: getRouteLabel(request),
            statusCode: response.statusCode,
            durationMs: elapsedTimeInMilliseconds
        });
    });
    next();
});
app.use('/', systemRoutes);
app.use((_request, response) => rejectResponse(response, 404, 'Not Found'));

let server: Server;
let baseUrl = '';

beforeAll(
    () =>
        new Promise<void>((resolve) => {
            // Use port 0 so the OS picks a free ephemeral port.
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

describe('API integration', () => {
    it('GET / returns a healthy response payload', async () => {
        const response = await fetch(`${baseUrl}/`);
        const body = (await response.json()) as {
            success: boolean;
            status: number;
            message: string;
            data: { status: string };
        };

        expect(response.status).toBe(200);
        expect(response.headers.get('x-request-id')).toBeTruthy();
        expect(response.headers.get('x-trace-id')).toMatch(/^[\da-f]{32}$/);
        expect(response.headers.get('traceparent')).toMatch(/^00-[\da-f]{32}-[\da-f]{16}-01$/);
        expect(body.success).toBe(true);
        expect(body.data.status).toBe('ok');
    });

    it('returns JSON 404 payload for unknown routes', async () => {
        const response = await fetch(`${baseUrl}/not-found`);
        const body = (await response.json()) as {
            success: boolean;
            status: number;
            message: string;
        };

        expect(response.status).toBe(404);
        expect(body.success).toBe(false);
        expect(body.message).toBe('Not Found');
    });

    it('GET /metrics returns prometheus metrics', async () => {
        const response = await fetch(`${baseUrl}/metrics`);
        const body = await response.text();

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toContain('text/plain');
        expect(body).toContain('# HELP http_requests_total');
        expect(body).toContain('http_requests_total{method="GET",route="/",status_code="200"}');
        expect(body).toContain('# HELP process_uptime_seconds');
    });
});
