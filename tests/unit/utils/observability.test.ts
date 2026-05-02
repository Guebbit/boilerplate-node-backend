/**
 * Unit tests for src/utils/observability.ts (Phase 2 — prom-client metrics)
 *
 * Strategy:
 * - Import helpers under test.
 * - Call recordRequestMetric with known inputs.
 * - Scrape getPrometheusMetrics() and assert the expected metric lines appear.
 *
 * prom-client stores metrics in the global default registry, which is module-scoped.
 * Jest runs each test file in its own V8 context, so state doesn't leak between files.
 */

import {
    normalizeRoutePath,
    recordRequestMetric,
    getPrometheusMetrics,
    createTraceContext,
    toTraceparentHeader,
    getRouteLabel
} from '@utils/observability';
import type { Request } from 'express';

// ─── normalizeRoutePath ───────────────────────────────────────────────────────

describe('normalizeRoutePath', () => {
    it('returns / for the root path', () => {
        expect(normalizeRoutePath('/')).toBe('/');
    });

    it('returns / for an empty string', () => {
        expect(normalizeRoutePath('')).toBe('/');
    });

    it('keeps clean segments unchanged', () => {
        expect(normalizeRoutePath('/products')).toBe('/products');
        expect(normalizeRoutePath('/account/login')).toBe('/account/login');
    });

    it('strips query strings', () => {
        expect(normalizeRoutePath('/products?page=2&limit=10')).toBe('/products');
    });

    it('replaces a numeric id segment with :id', () => {
        expect(normalizeRoutePath('/orders/42')).toBe('/orders/:id');
    });

    it('replaces a 24-char hex MongoDB ObjectId with :id', () => {
        expect(normalizeRoutePath('/orders/507f1f77bcf86cd799439011')).toBe('/orders/:id');
    });

    it('replaces a UUID segment with :id', () => {
        expect(normalizeRoutePath('/orders/550e8400-e29b-41d4-a716-446655440000')).toBe(
            '/orders/:id'
        );
    });
});

// ─── createTraceContext ───────────────────────────────────────────────────────

describe('createTraceContext', () => {
    it('generates a new 32-char hex traceId and 16-char spanId when no header is given', () => {
        // eslint-disable-next-line unicorn/no-useless-undefined
        const ctx = createTraceContext(undefined);
        expect(ctx.traceId).toMatch(/^[\da-f]{32}$/);
        expect(ctx.spanId).toMatch(/^[\da-f]{16}$/);
        expect(ctx.parentSpanId).toBeUndefined();
    });

    it('continues an upstream trace when a valid traceparent header is provided', () => {
        const upstreamTraceId = 'a'.repeat(32);
        const upstreamSpanId = 'b'.repeat(16);
        const traceparent = `00-${upstreamTraceId}-${upstreamSpanId}-01`;
        const ctx = createTraceContext(traceparent);
        expect(ctx.traceId).toBe(upstreamTraceId);
        expect(ctx.parentSpanId).toBe(upstreamSpanId);
        // New span for this hop
        expect(ctx.spanId).not.toBe(upstreamSpanId);
    });

    it('ignores a malformed traceparent and creates a fresh trace', () => {
        const ctx = createTraceContext('not-a-valid-traceparent');
        expect(ctx.traceId).toMatch(/^[\da-f]{32}$/);
        expect(ctx.parentSpanId).toBeUndefined();
    });
});

// ─── toTraceparentHeader ──────────────────────────────────────────────────────

describe('toTraceparentHeader', () => {
    it('encodes the trace context in W3C traceparent format', () => {
        const ctx = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16) };
        expect(toTraceparentHeader(ctx)).toBe(`00-${'a'.repeat(32)}-${'b'.repeat(16)}-01`);
    });
});

// ─── getRouteLabel ────────────────────────────────────────────────────────────

describe('getRouteLabel', () => {
    it('extracts the route label from request.path', () => {
        const req = { path: '/products', originalUrl: '/products?page=1' } as Request;
        expect(getRouteLabel(req)).toBe('/products');
    });

    it('falls back to originalUrl when path is empty', () => {
        const req = { path: '', originalUrl: '/orders/42' } as Request;
        expect(getRouteLabel(req)).toBe('/orders/:id');
    });
});

// ─── recordRequestMetric / getPrometheusMetrics ───────────────────────────────

describe('recordRequestMetric and getPrometheusMetrics', () => {
    it('increments http_requests_total and writes it to the metrics output', async () => {
        recordRequestMetric({ method: 'GET', route: '/test-route', statusCode: 200, durationMs: 5 });
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP http_requests_total');
        expect(output).toMatch(
            /http_requests_total{[^}]*method="GET"[^}]*route="\/test-route"[^}]*status_code="200"[^}]*} \d+/
        );
    });

    it('records the duration histogram for a request', async () => {
        recordRequestMetric({ method: 'POST', route: '/login', statusCode: 200, durationMs: 42 });
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP http_request_duration_milliseconds');
        expect(output).toContain('http_request_duration_milliseconds_bucket{');
    });

    it('increments http_errors_total for 4xx responses', async () => {
        recordRequestMetric({ method: 'GET', route: '/not-found', statusCode: 404, durationMs: 3 });
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP http_errors_total');
        expect(output).toMatch(/http_errors_total{[^}]*status_code="404"[^}]*} \d+/);
    });

    it('increments http_errors_total for 5xx responses', async () => {
        recordRequestMetric({ method: 'GET', route: '/boom', statusCode: 500, durationMs: 10 });
        const output = await getPrometheusMetrics();
        expect(output).toMatch(/http_errors_total{[^}]*status_code="500"[^}]*} \d+/);
    });

    it('does NOT add an http_errors_total entry for successful (2xx) responses', async () => {
        // Record a new unique route that will only have 2xx traffic in this test
        recordRequestMetric({ method: 'GET', route: '/ok-only', statusCode: 200, durationMs: 1 });
        const output = await getPrometheusMetrics();
        // Errors section must NOT have a line for this route+status combo
        expect(output).not.toMatch(/http_errors_total{[^}]*route="\/ok-only"[^}]*}/);
    });

    it('includes in-flight request gauge and process uptime gauge', async () => {
        const output = await getPrometheusMetrics();
        expect(output).toContain('# HELP http_in_flight_requests');
        expect(output).toContain('# HELP process_uptime_seconds');
    });

    it('includes nodejs eventloop lag from collectDefaultMetrics', async () => {
        const output = await getPrometheusMetrics();
        expect(output).toContain('nodejs_eventloop_lag_seconds');
    });
});
