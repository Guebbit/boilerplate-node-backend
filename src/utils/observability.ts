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

export const getHttpRequestCounters = () =>
    Promise.all([httpRequestsTotal.get(), httpRequestErrorsTotal.get()]).then(
        ([requestMetrics, errorMetrics]) => ({
            totalRequests: sumMetricValues(requestMetrics.values),
            totalErrors: sumMetricValues(errorMetrics.values)
        })
    );

/** Serialize all registered metrics in Prometheus text format. */
export const getPrometheusMetrics = (): Promise<string> => metricsRegistry.metrics();

/*
 * Compute approximate latency percentiles from cumulative histogram bucket data.
 * Uses linear interpolation between bucket boundaries.
 */
const estimatePercentile = (
    buckets: Array<{ value: number; labels: Record<string, string> }>,
    count: number,
    p: number
): number => {
    if (count === 0) return 0;
    const target = count * p;
    const leBuckets = buckets
        .filter((b) => b.labels['le'] && b.labels['le'] !== '+Inf')
        .sort((a, b) => Number(a.labels['le']) - Number(b.labels['le']));

    let prev = 0;
    let prevLe = 0;
    for (const bucket of leBuckets) {
        const le = Number(bucket.labels['le']);
        if (bucket.value >= target) {
            if (bucket.value === prev) return le;
            const fraction = (target - prev) / (bucket.value - prev);
            return prevLe + fraction * (le - prevLe);
        }
        prev = bucket.value;
        prevLe = le;
    }
    return prevLe;
};

/** Collect HTTP request counters + latency percentiles (p50, p95). */
export const getHttpMetricsSummary = () =>
    Promise.all([
        httpRequestsTotal.get(),
        httpRequestErrorsTotal.get(),
        httpRequestDuration.get(),
        httpInflightRequests.get()
    ]).then(([requestMetrics, errorMetrics, durationMetrics, inflightMetrics]) => {
        const totalRequests = sumMetricValues(requestMetrics.values);
        const totalErrors = sumMetricValues(errorMetrics.values);
        const inFlight = sumMetricValues(inflightMetrics.values);

        // Sum histogram across all labels to get overall count and bucket cumulative values.
        const bucketMap = new Map<string, number>();
        let totalCount = 0;
        for (const v of durationMetrics.values) {
            if (v.metricName === 'http_request_duration_milliseconds_count') {
                totalCount += v.value;
            } else if (v.metricName === 'http_request_duration_milliseconds_bucket') {
                // prom-client adds 'le' internally; cast to access it.
                const le = (v.labels as Record<string, string>)['le'];
                if (le) bucketMap.set(le, (bucketMap.get(le) ?? 0) + v.value);
            }
        }
        const aggregatedBuckets = Array.from(bucketMap.entries()).map(([le, value]) => ({
            value,
            labels: { le }
        }));

        return {
            totalRequests,
            totalErrors,
            errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
            inFlight,
            latencyMs: {
                p50: Math.round(estimatePercentile(aggregatedBuckets, totalCount, 0.5)),
                p95: Math.round(estimatePercentile(aggregatedBuckets, totalCount, 0.95))
            }
        };
    });
