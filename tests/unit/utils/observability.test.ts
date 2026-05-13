import {
    normalizeRoutePath,
    recordRequestMetric,
    incrementInflight,
    decrementInflight,
    getPrometheusMetrics
} from '@utils/observability';

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
        expect(normalizeRoutePath('/items/550e8400-e29b-41d4-a716-446655440000')).toBe(
            '/items/:id'
        );
    });

    it('strips query strings', () => {
        expect(normalizeRoutePath('/products?page=1&limit=10')).toBe('/products');
    });
});

describe('recordRequestMetric', () => {
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
        recordRequestMetric({ method: 'GET', route: '/ok', statusCode: 200, durationMs: 10 });
        const metrics = await getPrometheusMetrics();
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
});

describe('incrementInflight / decrementInflight', () => {
    it('http_requests_in_flight appears in metrics output', async () => {
        incrementInflight();
        decrementInflight();
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('http_requests_in_flight');
    });
});

describe('getPrometheusMetrics — standard families', () => {
    it('includes process_uptime_seconds', async () => {
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('# HELP process_uptime_seconds');
    });

    it('includes nodejs_eventloop_lag_seconds (prom-client default)', async () => {
        const metrics = await getPrometheusMetrics();
        expect(metrics).toContain('nodejs_eventloop_lag_seconds');
    });
});
