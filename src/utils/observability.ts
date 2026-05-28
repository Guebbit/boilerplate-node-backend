import type { Request } from 'express';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/** Shared prom-client registry. */
export const metricsRegistry = register;

// Default Node.js / process metrics (CPU, memory, event loop, GC, ...).
collectDefaultMetrics({ register: metricsRegistry });

// prom-client omits process_uptime_seconds; add it so dashboards can show uptime.
const _processUptimeGauge = new Gauge({
    name: 'process_uptime_seconds',
    help: 'Uptime of the Node.js process in seconds.',
    registers: [metricsRegistry],
    collect() {
        this.set(process.uptime());
    }
});

/** Total HTTP requests by method, route template, and status code. */
export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests handled.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [metricsRegistry]
});

/** Request duration histogram (milliseconds). */
export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_milliseconds',
    help: 'HTTP request duration in milliseconds.',
    labelNames: ['method', 'route'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [metricsRegistry]
});

/** 4xx/5xx responses by method, route, and status code. */
export const httpRequestErrorsTotal = new Counter({
    name: 'http_request_errors_total',
    help: 'Total number of HTTP requests that returned a 4xx or 5xx status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [metricsRegistry]
});

/** Live count of requests being processed by Express right now. */
export const httpInflightRequests = new Gauge({
    name: 'http_requests_in_flight',
    help: 'Number of HTTP requests currently in flight.',
    registers: [metricsRegistry]
});

/** Collapse high-cardinality path segments (IDs) into a stable :id placeholder. */
const sanitizeRouteSegment = (segment: string): string => {
    if (/^\d+$/.test(segment)) return ':id';
    if (/^[\da-f]{24}$/i.test(segment)) return ':id';
    if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(segment)) return ':id';
    return segment;
};

/** Normalize a URL path to a stable metric label. */
export const normalizeRoutePath = (path: string): string => {
    const pathWithoutQuery = path.split('?')[0] || '/';
    const segments = pathWithoutQuery
        .split('/')
        .filter(Boolean)
        .map((segment) => sanitizeRouteSegment(segment));
    return segments.length > 0 ? `/${segments.join('/')}` : '/';
};

/** Best-effort route label extraction for the metrics middleware. */
export const getRouteLabel = (request: Request): string =>
    normalizeRoutePath(request.path || request.originalUrl || '/');

interface IRequestMetricInput {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
}

/** Record one completed HTTP request (counter + histogram + error counter). */
export const recordRequestMetric = ({
    method,
    route,
    statusCode,
    durationMs
}: IRequestMetricInput): void => {
    const labels = { method, route, status_code: String(statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDuration.observe({ method, route }, durationMs);
    if (statusCode >= 400) httpRequestErrorsTotal.inc(labels);
};

export const incrementInflight = (): void => {
    httpInflightRequests.inc();
};

export const decrementInflight = (): void => {
    httpInflightRequests.dec();
};

const sumMetricValues = (values: Array<{ value: number }>) =>
    values.reduce((sum, value) => sum + value.value, 0);

interface ILatencyBucket {
    upperBound: number;
    cumulativeCount: number;
}

const aggregateLatencyBuckets = (
    values: Array<{
        value: number;
        labels: Record<string, string | number | undefined>;
        metricName?: string;
    }>
): { buckets: ILatencyBucket[]; totalCount: number } => {
    const totals = new Map<number, number>();
    let totalCount = 0;

    for (const { value, labels, metricName } of values) {
        if (metricName) continue;
        const le = labels.le;
        if (le === undefined) continue;
        if (le === '+Inf') {
            totalCount += value;
            continue;
        }

        const boundary = Number(le);
        totals.set(boundary, (totals.get(boundary) ?? 0) + value);
    }

    const buckets = [...totals.entries()]
        .toSorted(([a], [b]) => a - b)
        .map(([upperBound, cumulativeCount]) => ({ upperBound, cumulativeCount }));

    return { buckets, totalCount };
};

export const percentileFromHistogramBuckets = (
    buckets: ILatencyBucket[],
    totalCount: number,
    percentile: number
): number => {
    if (totalCount <= 0 || buckets.length === 0) return 0;

    const threshold = totalCount * percentile;
    for (const { upperBound, cumulativeCount } of buckets) {
        if (cumulativeCount >= threshold) return upperBound;
    }

    return buckets.at(-1)?.upperBound ?? 0;
};

export const getHttpRequestCounters = () =>
    Promise.all([httpRequestsTotal.get(), httpRequestErrorsTotal.get()]).then(
        ([requestMetrics, errorMetrics]) => ({
            totalRequests: sumMetricValues(requestMetrics.values),
            totalErrors: sumMetricValues(errorMetrics.values)
        })
    );

/** Serialize all registered metrics in Prometheus text format. */
export const getPrometheusMetrics = (): Promise<string> => metricsRegistry.metrics();

/** Estimate p50 and p95 latency (ms) from the request-duration histogram buckets. */
export const getLatencyPercentiles = (): Promise<{ p50: number; p95: number }> =>
    httpRequestDuration.get().then(({ values }) => {
        const { buckets, totalCount } = aggregateLatencyBuckets(values);
        return {
            p50: percentileFromHistogramBuckets(buckets, totalCount, 0.5),
            p95: percentileFromHistogramBuckets(buckets, totalCount, 0.95)
        };
    });
