import type { Request } from 'express';
import crypto from 'node:crypto';
import { register, collectDefaultMetrics, Counter, Histogram, Gauge } from 'prom-client';

// ─── Trace context ────────────────────────────────────────────────────────────

/**
 * Trace context carried for a single request.
 * - traceId: whole request journey (cross-service)
 * - spanId: current service/unit of work
 * - parentSpanId: upstream span (if propagated)
 */
export interface ITraceContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
}

interface IRequestMetricInput {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
}

// ─── Prometheus setup ─────────────────────────────────────────────────────────

/**
 * Activate prom-client's default process/runtime metrics collector.
 * This provides: CPU usage, memory, event loop lag, GC durations, open handles.
 * See: https://github.com/siimon/prom-client#default-metrics
 */
collectDefaultMetrics();

/**
 * Total HTTP requests, labelled by method, normalised route, and status code.
 * Use this counter to compute request rates and error rates per endpoint.
 */
const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests handled.',
    labelNames: ['method', 'route', 'status_code'] as const
});

/**
 * HTTP request duration distribution (milliseconds).
 * Buckets are chosen to span the practical range for a REST API.
 * Use the _bucket / _sum / _count series for latency percentiles in Grafana.
 */
const httpRequestDurationMs = new Histogram({
    name: 'http_request_duration_milliseconds',
    help: 'HTTP request duration in milliseconds.',
    labelNames: ['method', 'route'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000]
});

/**
 * HTTP error responses (4xx + 5xx only).
 * Kept separate from the general counter so alert rules stay simple.
 */
const httpErrorsTotal = new Counter({
    name: 'http_errors_total',
    help: 'Total number of HTTP error responses (4xx and 5xx).',
    labelNames: ['method', 'route', 'status_code'] as const
});

/**
 * Requests currently being processed.
 * A sustained spike here means the event loop is saturated.
 */
const httpInFlightRequests = new Gauge({
    name: 'http_in_flight_requests',
    help: 'Number of HTTP requests currently being processed.'
});

/**
 * Uncaught runtime exceptions counter.
 * Incremented by the process `uncaughtException` listener in app.ts.
 */
export const processRuntimeErrorsTotal = new Counter({
    name: 'process_runtime_errors_total',
    help: 'Total number of uncaught runtime errors observed by the process.'
});

/**
 * Custom uptime gauge.
 * prom-client's default metrics expose process_start_time_seconds; this
 * derived gauge is simpler to read in dashboards and maintained for
 * backward compatibility with Phase-1 tests.
 */
new Gauge({
    name: 'process_uptime_seconds',
    help: 'Uptime of the Node.js process in seconds.',
    collect() {
        this.set(process.uptime());
    }
});

// ─── Route normalisation ──────────────────────────────────────────────────────

const TRACE_ID_REGEX = /^[\da-f]{32}$/i;
const SPAN_ID_REGEX = /^[\da-f]{16}$/i;
const TRACEPARENT_REGEX = /^00-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;

/**
 * Collapse high-cardinality identifiers into :id placeholders.
 * Keeps the metric label space small and Prometheus-friendly.
 */
const sanitizeRouteSegment = (segment: string): string => {
    if (/^\d+$/.test(segment)) return ':id';
    if (/^[\da-f]{24}$/i.test(segment)) return ':id';
    if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(segment)) return ':id';
    return segment;
};

/**
 * Normalize URL path into a stable metric route label.
 * Example: /orders/660f... -> /orders/:id
 */
export const normalizeRoutePath = (path: string): string => {
    const pathWithoutQueryString = path.split('?')[0] || '/';
    const segments = pathWithoutQueryString
        .split('/')
        .filter(Boolean)
        .map((segment) => sanitizeRouteSegment(segment));
    return segments.length > 0 ? `/${segments.join('/')}` : '/';
};

// ─── Trace context helpers ────────────────────────────────────────────────────

const parseTraceparent = (
    traceparent: string | undefined
): { traceId?: string; parentSpanId?: string } => {
    if (!traceparent) return {};
    const match = TRACEPARENT_REGEX.exec(traceparent.trim());
    if (!match) return {};
    const traceId = match[1];
    const parentSpanId = match[2];
    if (!TRACE_ID_REGEX.test(traceId) || !SPAN_ID_REGEX.test(parentSpanId)) return {};
    return { traceId, parentSpanId };
};

const generateTraceId = (): string => crypto.randomBytes(16).toString('hex');
const generateSpanId = (): string => crypto.randomBytes(8).toString('hex');

/**
 * Build request trace context.
 * Continues an upstream trace when a valid W3C traceparent header is present.
 */
export const createTraceContext = (incomingTraceparent: string | undefined): ITraceContext => {
    const parsed = parseTraceparent(incomingTraceparent);
    return {
        traceId: parsed.traceId ?? generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: parsed.parentSpanId
    };
};

/**
 * Re-encode the local trace context into the standard W3C traceparent header.
 */
export const toTraceparentHeader = (traceContext: ITraceContext): string =>
    `00-${traceContext.traceId}-${traceContext.spanId}-01`;

// ─── Metric recording ─────────────────────────────────────────────────────────

/**
 * Record one completed HTTP request.
 * Updates: request counter, duration histogram, error counter (4xx/5xx).
 * Called from the response 'finish' handler in the metrics middleware.
 */
export const recordRequestMetric = ({
    method,
    route,
    statusCode,
    durationMs
}: IRequestMetricInput): void => {
    const m = method.toUpperCase();
    httpRequestsTotal.labels(m, route, String(statusCode)).inc();
    httpRequestDurationMs.labels(m, route).observe(durationMs);
    if (statusCode >= 400) {
        httpErrorsTotal.labels(m, route, String(statusCode)).inc();
    }
};

/**
 * Track in-flight request count.
 * Call inc() when the request arrives, dec() when the response finishes.
 */
export const inFlightRequests = {
    inc: () => httpInFlightRequests.inc(),
    dec: () => httpInFlightRequests.dec()
};

/**
 * Prometheus content type for the Content-Type response header.
 */
export const prometheusContentType = register.contentType;

/**
 * Render all registered metrics in Prometheus text format.
 * Async because prom-client collectors (e.g. event-loop lag) are async.
 */
export const getPrometheusMetrics = (): Promise<string> => register.metrics();

/**
 * Best-effort route label extraction for metric labels.
 */
export const getRouteLabel = (request: Request): string =>
    normalizeRoutePath(request.path || request.originalUrl || '/');
