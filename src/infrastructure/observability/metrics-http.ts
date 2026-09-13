/**
 * @module
 * HTTP and process metrics (Prometheus). Metrics are *aggregates* — cheap, always-on, and the
 * right signal for dashboards and alerts. Traces (`observability/tracer`) are per-request and
 * answer "why was this one slow"; metrics answer "how is the service doing overall".
 *
 * See: docs/tools/opentelemetry.md
 */

import type { Request } from 'express';
import { getHeapStatistics } from 'node:v8';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

/**
 * Shared prom-client registry. `register` is the library's default global registry, the
 * collection `/metrics` serializes — re-exported under a project name so each module's
 * `metrics.ts` registers against the same instance instead of creating its own invisible one.
 * Also how `GET /observability/metrics/overview` reaches domain counters, by name off this
 * registry rather than importing the owning module.
 */
export const metricsRegistry = register;

// Default Node.js / process metrics (CPU, memory, event loop, GC, ...).
// One call, and prom-client installs a large set of runtime collectors — including
// `nodejs_eventloop_lag_seconds`, which is the single best indicator of a blocked event loop.
collectDefaultMetrics({ register: metricsRegistry });

/**
 * prom-client omits process_uptime_seconds; add it so dashboards can show uptime.
 * Assigned to an unused underscore-prefixed variable purely to satisfy lint rules: the
 * constructor's side effect (registering itself) is the whole point, not the reference.
 */
// Gauge: name follows Prometheus's snake_case/_seconds convention; help is mandatory and shown
// verbatim as `# HELP`; collect() runs at scrape time (non-arrow so `this` is the gauge).
const _processUptimeGauge = new Gauge({
    name: 'process_uptime_seconds',
    help: 'Uptime of the Node.js process in seconds.',
    registers: [metricsRegistry],
    collect() {
        this.set(process.uptime());
    }
});

/**
 * The ceiling V8 will not grow the heap past, in bytes.
 *
 * prom-client ships `used`/`total` but not this: `total` is heap V8 has committed so far and
 * grows on demand, so `used / total` sits near 1 on a healthy process — an alert on that ratio
 * fires permanently. `heap_size_limit` is the fixed ceiling, so `used / limit` is what actually
 * means "close to OOM" (see `HighHeapUsage` in `prometheus.alert-rules.yaml`).
 */
const _heapSizeLimitGauge = new Gauge({
    name: 'nodejs_heap_size_limit_bytes',
    help: 'Maximum heap size V8 will allocate for this process, in bytes.',
    registers: [metricsRegistry],
    collect() {
        this.set(getHeapStatistics().heap_size_limit);
    }
});

/**
 * Total HTTP requests by method, route template, and status code.
 * The canonical RED-metric numerator: rate and error ratio both derive from it.
 */
export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests handled.',
    // Labels = the dimensions you can slice by. Every distinct label *combination* becomes its
    // own time series, so cardinality must stay bounded — which is exactly why `route` is the
    // template Express matched (see `getRouteLabel`) and never a path from the request.
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [metricsRegistry]
});

/** Request duration histogram (milliseconds). */
export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_milliseconds',
    help: 'HTTP request duration in milliseconds.',
    // No `status_code` label (would multiply series by bucket count). Buckets are roughly
    // logarithmic — cache hits (5-25ms), DB-backed (50-250ms), pathological (1-5s) — tighter at
    // the low end since percentiles can only resolve to a bucket boundary.
    labelNames: ['method', 'route'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [metricsRegistry]
});

/**
 * 4xx/5xx responses by method, route, and status code.
 * Redundant with `httpRequestsTotal` filtered by status, but a dedicated counter keeps
 * alerting rules simple and cheap.
 */
export const httpRequestErrorsTotal = new Counter({
    name: 'http_request_errors_total',
    help: 'Total number of HTTP requests that returned a 4xx or 5xx status.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [metricsRegistry]
});

/**
 * Live count of requests being processed by Express right now.
 * A Gauge, not a Counter — it decreases. Sustained growth means requests are arriving faster
 * than they complete, i.e. the service is saturating.
 */
export const httpInflightRequests = new Gauge({
    name: 'http_requests_in_flight',
    help: 'Number of HTTP requests currently in flight.',
    // Unlabelled: a single number for the whole process is what makes it useful at a glance.
    registers: [metricsRegistry]
});

/**
 * The label for a request that matched no route — one value for every path the app does not serve.
 * prom-client never evicts a series, and a public deployment is scanned against a near-infinite
 * path dictionary, so anything derived from the requested path grows the registry without bound.
 */
export const UNMATCHED_ROUTE = 'unmatched';

/**
 * The route template a request matched, as its metric label. Express populates `request.route`
 * during routing, so every caller reads this inside a `finish` listener; `route.path` is relative
 * to the router's mount point, `baseUrl` supplies the rest. No match collapses to `unmatched`.
 *
 * @param request - the request, read after routing
 * @returns the mounted route template, or `unmatched`
 */
export const getRouteLabel = (request: Request): string => {
    // Express types `route` as `any`, and it may hold a RegExp or an array for routes declared
    // that way; only a plain string names one template, and anything else is not worth a series
    // of its own. Read through `unknown` so the `any` stops here.
    const matched: unknown = request.route;
    const template = (matched as { path?: unknown } | undefined)?.path;
    if (typeof template !== 'string') return UNMATCHED_ROUTE;

    const mounted = `${request.baseUrl}${template}`;
    // `router.get('/')` mounted at `/orders` spells itself `/orders/`; the trailing slash is the
    // same route as `/orders` and must not be a second series.
    return mounted.length > 1 ? mounted.replace(/\/$/, '') : '/';
};

/** Input for `recordRequestMetric` — an object rather than four positional args, so a caller cannot transpose method and route. */
interface RequestMetricInput {
    method: string;
    /** Already normalized — see `getRouteLabel`. */
    route: string;
    statusCode: number;
    durationMs: number;
}

/**
 * Record one completed HTTP request (counter + histogram + error counter).
 * Called once per response by the metrics middleware, on the `finish` event.
 */
export const recordRequestMetric = ({
    method,
    route,
    statusCode,
    durationMs
}: RequestMetricInput): void => {
    // Label values must be strings in the Prometheus exposition format.
    const labels = { method, route, status_code: String(statusCode) };
    // `inc()` with no amount increments by 1.
    httpRequestsTotal.inc(labels);
    // `observe(labels, value)` files the duration into the matching bucket. Note the narrower
    // label set — the histogram has no `status_code` dimension.
    httpRequestDuration.observe({ method, route }, durationMs);
    // 4xx and 5xx both count as errors here. Splitting client from server faults is left to
    // queries over the `status_code` label.
    if (statusCode >= 400) httpRequestErrorsTotal.inc(labels);
};

/**
 * Increment the in-flight request gauge when a request starts.
 * Must be paired with exactly one `decrementInflight()` per request, including on error and
 * client-abort paths — a missed decrement makes the gauge drift upward permanently.
 */
export const incrementInflight = (): void => {
    httpInflightRequests.inc();
};

/** Decrement the in-flight request gauge when a request finishes. */
export const decrementInflight = (): void => {
    httpInflightRequests.dec();
};

/**
 * Sum raw metric sample values from a prom-client get() result. A metric's `get()` returns one
 * entry per label combination, so totalling across every series is the only way to get one
 * overall number.
 */
const sumMetricValues = (values: { value: number }[]) =>
    values.reduce((sum, value) => sum + value.value, 0);

/** One histogram bucket: its upper bound and the *cumulative* count at or below it. */
interface LatencyBucket {
    upperBound: number;
    /** Cumulative, not per-bucket — Prometheus histograms are cumulative by definition. */
    cumulativeCount: number;
}

/**
 * Collapse histogram values into per-boundary bucket totals.
 * prom-client histogram get() mixes _sum/_count rows (metricName set) with bucket rows — skip the former.
 * The +Inf bucket gives the total request count.
 */
const aggregateLatencyBuckets = (
    values: {
        value: number;
        labels: Record<string, string | number | undefined>;
        metricName?: string;
    }[]
): { buckets: LatencyBucket[]; totalCount: number } => {
    // Keyed by bucket boundary, summing across every method/route series — the goal is one
    // service-wide latency distribution, not a per-route one.
    const totals = new Map<number, number>();
    let totalCount = 0;

    for (const { value, labels, metricName } of values) {
        // prom-client sets `metricName` only on the derived `_sum` and `_count` rows; bucket
        // rows leave it undefined. Including them would inflate the counts badly.
        if (metricName) continue;
        // `le` ("less than or equal") is the standard Prometheus bucket-boundary label.
        const { le } = labels;
        if (le === undefined) continue;
        // The `+Inf` bucket counts *every* observation, so it is the total sample count.
        if (le === '+Inf') {
            totalCount += value;
            continue;
        }

        const boundary = Number(le);
        totals.set(boundary, (totals.get(boundary) ?? 0) + value);
    }

    // Ascending order is required by the percentile scan below, which relies on cumulative
    // counts increasing monotonically. `toSorted` copies rather than mutating in place.
    const buckets = [...totals.entries()]
        .toSorted(([a], [b]) => a - b)
        .map(([upperBound, cumulativeCount]) => ({ upperBound, cumulativeCount }));

    return { buckets, totalCount };
};

/**
 * Estimate a percentile from cumulative histogram buckets. Walks up the buckets and returns the
 * first boundary whose cumulative count reaches the target rank.
 *
 * The result is always a bucket *boundary*, so it over-estimates within the bucket — a true p95
 * of 60ms reports as 100ms here. Real Prometheus interpolates (`histogram_quantile`); this is a
 * deliberately simpler approximation for the in-app overview endpoint.
 *
 * @param percentile - fraction in [0, 1], e.g. 0.95
 */
export const percentileFromHistogramBuckets = (
    buckets: LatencyBucket[],
    totalCount: number,
    percentile: number
): number => {
    // No data yet (fresh process) — report 0 rather than NaN, which would break dashboards.
    if (totalCount <= 0 || buckets.length === 0) return 0;

    // Rank of the target observation, e.g. the 95th out of 100.
    const threshold = totalCount * percentile;
    for (const { upperBound, cumulativeCount } of buckets) {
        if (cumulativeCount >= threshold) return upperBound;
    }

    // Fallthrough: the target rank sits in the `+Inf` bucket (i.e. slower than the largest
    // boundary), so report the highest finite bound as a floor on the true value.
    return buckets.at(-1)?.upperBound ?? 0;
};

/**
 * Read total request and error counters from prom-client in one call.
 * Async because prom-client metric reads return promises (a `collect()` hook may itself be async).
 * `Promise.all` reads both in parallel, so the two totals come from the same instant.
 */
export const getHttpRequestCounters = () =>
    Promise.all([httpRequestsTotal.get(), httpRequestErrorsTotal.get()]).then(
        ([requestMetrics, errorMetrics]) => ({
            totalRequests: sumMetricValues(requestMetrics.values),
            totalErrors: sumMetricValues(errorMetrics.values)
        })
    );

/**
 * Serialize all registered metrics in Prometheus text format.
 * This is the body of the `/metrics` endpoint that Prometheus scrapes; `registry.metrics()`
 * runs every `collect()` hook and renders the whole registry.
 */
export const getPrometheusMetrics = (): Promise<string> => metricsRegistry.metrics();

/**
 * Estimate p50 and p95 latency (ms) from the request-duration histogram buckets. Percentiles
 * rather than an average, because an average hides the tail: p95 is what the unluckiest 5% of
 * users experience.
 *
 * Computed over the *entire process lifetime*, not a recent window, so a spike gets diluted over
 * time — for time-windowed values, query the scraped histogram with `histogram_quantile` instead.
 */
export const getLatencyPercentiles = (): Promise<{ p50: number; p95: number }> =>
    httpRequestDuration.get().then(({ values }) => {
        const { buckets, totalCount } = aggregateLatencyBuckets(values);
        return {
            // Median — the typical request.
            p50: percentileFromHistogramBuckets(buckets, totalCount, 0.5),
            // Tail — the usual SLO target.
            p95: percentileFromHistogramBuckets(buckets, totalCount, 0.95)
        };
    });
