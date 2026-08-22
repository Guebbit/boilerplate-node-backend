import type { Request } from 'express';
import { asStub } from '@tests/stub';
import {
    getRouteLabel,
    UNMATCHED_ROUTE,
    recordRequestMetric,
    incrementInflight,
    decrementInflight,
    getPrometheusMetrics,
    percentileFromHistogramBuckets
} from '@infrastructure/observability/metrics-http';

/** A request as Express leaves it once routing has run — which is when the label is read. */
const routed = (baseUrl: string, path?: unknown) =>
    asStub<Request>({ baseUrl, ...(path === undefined ? {} : { route: { path } }) });

/**
 * `route` is a metric LABEL, and cardinality is a correctness property of one: prom-client never
 * evicts a series, so an unbounded label set grows the registry for the life of the process, slows
 * every scrape, and takes Prometheus' memory with it. Any public deployment is scanned
 * continuously against a dictionary of paths it does not serve, so "normalize the requested path"
 * bounds nothing — the bound has to come from the routes the application declares.
 */
describe('getRouteLabel', () => {
    it('names the template Express matched, mounted', () => {
        // `/:id`, not `/orders/507f1f77bcf86cd799439011` and not a guess at which segment was an
        // id: one series per route, whatever the ids look like.
        expect(getRouteLabel(routed('/orders', '/:id'))).toBe('/orders/:id');
        expect(getRouteLabel(routed('/orders', '/:id/invoice'))).toBe('/orders/:id/invoice');
    });

    it('spells a router root without its trailing slash', () => {
        // `router.get('/')` mounted at `/orders` is the same route as `/orders`, and two spellings
        // of one route are two time series.
        expect(getRouteLabel(routed('/orders', '/'))).toBe('/orders');
        expect(getRouteLabel(routed('', '/'))).toBe('/');
    });

    it('collapses everything that matched no route into one series', () => {
        // The cardinality bomb, defused: a scanner's whole dictionary shares a single label.
        expect(getRouteLabel(routed('/wp-login.php'))).toBe(UNMATCHED_ROUTE);
        expect(getRouteLabel(routed('/vendor/phpunit/eval-stdin.php'))).toBe(UNMATCHED_ROUTE);
        expect(getRouteLabel(routed('/.env'))).toBe(UNMATCHED_ROUTE);
    });

    it('refuses a route declared as an array or a pattern rather than one template', () => {
        // Express allows both, and neither names a single template worth a series.
        expect(getRouteLabel(routed('/products', ['/a', '/b']))).toBe(UNMATCHED_ROUTE);
        expect(getRouteLabel(routed('/products', /^\/x/))).toBe(UNMATCHED_ROUTE);
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

describe('percentileFromHistogramBuckets', () => {
    it('returns 0 for empty histograms', () => {
        expect(percentileFromHistogramBuckets([], 0, 0.95)).toBe(0);
    });

    it('picks first bucket whose cumulative count reaches percentile threshold', () => {
        const buckets = [
            { upperBound: 10, cumulativeCount: 2 },
            { upperBound: 25, cumulativeCount: 5 },
            { upperBound: 50, cumulativeCount: 9 }
        ];

        expect(percentileFromHistogramBuckets(buckets, 10, 0.5)).toBe(25);
        expect(percentileFromHistogramBuckets(buckets, 10, 0.95)).toBe(50);
    });
});
