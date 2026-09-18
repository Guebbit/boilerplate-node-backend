/**
 * @module
 * HTTP request metrics (Prometheus): counters, the duration histogram, and the in-flight gauge.
 * Metrics are *aggregates* — cheap, always-on, and the right signal for dashboards and alerts.
 * Traces (`observability/tracer`) are per-request and answer "why was this one slow"; metrics
 * answer "how is the service doing overall". The registry itself, the default process collectors
 * and `getPrometheusMetrics` live in `metrics-registry.ts`; the read-back functions that turn
 * these counters into `GET /observability/metrics/overview`'s JSON live in
 * `modules/observability/metrics.ts` — this file only defines and records them.
 *
 * See: docs/tools/opentelemetry.md
 */

import type { Request } from 'express';
import { Counter, Histogram, Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';

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
