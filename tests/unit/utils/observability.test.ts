/**
 * Unit tests for src/utils/observability.ts
 *
 * Tests cover:
 * - normalizeRoutePath: ID segment collapsing
 * - createTraceContext: traceparent propagation and fresh generation
 * - toTraceparentHeader: W3C header re-encoding
 * - recordRequestMetric: counter/histogram/error-counter side-effects
 * - getPrometheusMetrics: presence of expected metric names
 */

import {
    normalizeRoutePath,
    createTraceContext,
    toTraceparentHeader,
    recordRequestMetric,
    incrementInflight,
    decrementInflight,
    getPrometheusMetrics
} from '@utils/observability';

// ---------------------------------------------------------------------------
// normalizeRoutePath
// ---------------------------------------------------------------------------

describe('normalizeRoutePath', () => {
    it('returns / for empty or root paths', () => {
        expect(normalizeRoutePath('/')).toBe('/');
        expect(normalizeRoutePath('')).toBe('/');
    });

    it('keeps static segments unchanged', () => {
        expect(normalizeRoutePath('/products')).toBe('/products');
        expect(normalizeRoutePath('/account/login')).toBe('/account/login');
    });

    it('collapses numeric IDs', () => {
        expect(normalizeRoutePath('/orders/42')).toBe('/orders/:id');
    });

    it('collapses MongoDB ObjectIDs (24-char hex)', () => {
        expect(normalizeRoutePath('/users/507f1f77bcf86cd799439011')).toBe('/users/:id');
    });

    it('collapses UUIDs', () => {
        expect(normalizeRoutePath('/items/550e8400-e29b-41d4-a716-446655440000')).toBe('/items/:id');
    });

    it('strips query strings', () => {
        expect(normalizeRoutePath('/products?page=1&limit=10')).toBe('/products');
    });

    it('handles nested dynamic segments', () => {
        expect(normalizeRoutePath('/orders/507f1f77bcf86cd799439011/invoice')).toBe(
            '/orders/:id/invoice'
        );
    });
});

// ---------------------------------------------------------------------------
// createTraceContext
// ---------------------------------------------------------------------------

describe('createTraceContext', () => {
    it('generates a fresh trace and span when no traceparent is provided', () => {
        const ctx = createTraceContext(void 0);
        expect(ctx.traceId).toMatch(/^[\da-f]{32}$/);
        expect(ctx.spanId).toMatch(/^[\da-f]{16}$/);
        expect(ctx.parentSpanId).toBeUndefined();
    });

    it('propagates a valid upstream traceparent', () => {
        const upstream = '00-4bf92f3577b34da6a3ce929d0e0e4736-1111111111111111-01';
        const ctx = createTraceContext(upstream);
        expect(ctx.traceId).toBe('4bf92f3577b34da6a3ce929d0e0e4736');
        expect(ctx.parentSpanId).toBe('1111111111111111');
        // Local span ID must differ from the upstream span ID
        expect(ctx.spanId).not.toBe('1111111111111111');
    });

    it('ignores malformed traceparent and generates a new trace', () => {
        const ctx = createTraceContext('invalid-header');
        expect(ctx.traceId).toMatch(/^[\da-f]{32}$/);
        expect(ctx.parentSpanId).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// toTraceparentHeader
// ---------------------------------------------------------------------------

describe('toTraceparentHeader', () => {
    it('encodes context in W3C traceparent format', () => {
        const header = toTraceparentHeader({
            traceId: 'abcd'.repeat(8),
            spanId: 'ef01'.repeat(4)
        });
        expect(header).toBe(`00-${'abcd'.repeat(8)}-${'ef01'.repeat(4)}-01`);
    });
});

// ---------------------------------------------------------------------------
// recordRequestMetric + getPrometheusMetrics
// ---------------------------------------------------------------------------

describe('recordRequestMetric / getPrometheusMetrics', () => {
    it('increments http_requests_total and appears in metrics output', async () => {
        recordRequestMetric({ method: 'POST', route: '/test', statusCode: 200, durationMs: 50 });
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('http_requests_total');
        expect(metrics).toContain('method="POST"');
        expect(metrics).toContain('route="/test"');
    });

    it('increments http_request_errors_total for 4xx responses', async () => {
        recordRequestMetric({ method: 'GET', route: '/bad', statusCode: 404, durationMs: 5 });
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('http_request_errors_total');
        expect(metrics).toContain('status_code="404"');
    });

    it('does not increment error counter for 2xx responses', async () => {
        // Record only a 2xx request and verify its label does not appear in error counter
        recordRequestMetric({ method: 'GET', route: '/ok', statusCode: 200, durationMs: 10 });
        const metrics = await getPrometheusMetrics();
        // The error counter should not have a line for /ok with 200
        const errorLine = metrics
            .split('\n')
            .find(
                (line) =>
                    line.startsWith('http_request_errors_total') &&
                    line.includes('route="/ok"') &&
                    line.includes('status_code="200"')
            );
        expect(errorLine).toBeUndefined();
    });

    it('records the duration histogram', async () => {
        recordRequestMetric({ method: 'GET', route: '/ping', statusCode: 200, durationMs: 100 });
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('http_request_duration_milliseconds_bucket');
        expect(metrics).toContain('http_request_duration_milliseconds_sum');
        expect(metrics).toContain('http_request_duration_milliseconds_count');
    });
});

// ---------------------------------------------------------------------------
// incrementInflight / decrementInflight
// ---------------------------------------------------------------------------

describe('incrementInflight / decrementInflight', () => {
    it('http_requests_in_flight appears in metrics output', async () => {
        incrementInflight();
        decrementInflight();
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('http_requests_in_flight');
    });
});

// ---------------------------------------------------------------------------
// getPrometheusMetrics — process and default metrics
// ---------------------------------------------------------------------------

describe('getPrometheusMetrics — standard metric families', () => {
    it('includes process_uptime_seconds', async () => {
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('# HELP process_uptime_seconds');
        expect(metrics).toContain('process_uptime_seconds ');
    });

    it('includes nodejs_eventloop_lag_seconds (prom-client default)', async () => {
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('nodejs_eventloop_lag_seconds');
    });

    it('includes process_resident_memory_bytes', async () => {
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('process_resident_memory_bytes');
    });
});
