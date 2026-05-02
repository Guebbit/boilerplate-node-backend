import type { Request } from 'express';
import crypto from 'node:crypto';
import { register, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';

// ─── Prometheus registry ────────────────────────────────────────────────────

/** Shared prom-client registry. Import this in tests to inspect or reset. */
export const metricsRegistry = register;

// Collect built-in Node.js / process metrics: CPU, memory, event loop, GC, heap spaces, etc.
collectDefaultMetrics({ register: metricsRegistry });

// prom-client omits process_uptime_seconds from its defaults; add it here.
// The collect() callback is called at scrape time so the value is always current.
const _processUptimeGauge = new Gauge({
    name: 'process_uptime_seconds',
    help: 'Uptime of the Node.js process in seconds.',
    registers: [metricsRegistry],
    collect() {
        this.set(process.uptime());
    }
});

// ─── HTTP metrics ────────────────────────────────────────────────────────────

/** Total HTTP requests by method, route template, and status code. */
export const httpRequestsTotal = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests handled.',
    labelNames: ['method', 'route', 'status_code'] as const,
    registers: [metricsRegistry]
});

/** Request duration histogram (milliseconds) — use method + route labels. */
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

// ─── Trace context ───────────────────────────────────────────────────────────

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

const TRACE_ID_REGEX = /^[\da-f]{32}$/i;
const SPAN_ID_REGEX = /^[\da-f]{16}$/i;
const TRACEPARENT_REGEX = /^00-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;

/** Parse incoming W3C traceparent. Returns empty object when missing or malformed. */
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

/** W3C trace IDs are 16 random bytes encoded as hex. */
const generateTraceId = (): string => crypto.randomBytes(16).toString('hex');
/** Span IDs identify one hop inside a trace. */
const generateSpanId = (): string => crypto.randomBytes(8).toString('hex');

/** Build trace context: continue upstream trace when present, always create a new span ID. */
export const createTraceContext = (incomingTraceparent: string | undefined): ITraceContext => {
    const parsed = parseTraceparent(incomingTraceparent);
    return {
        traceId: parsed.traceId ?? generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: parsed.parentSpanId
    };
};

/** Re-encode trace context as a W3C traceparent header value. */
export const toTraceparentHeader = (traceContext: ITraceContext): string =>
    `00-${traceContext.traceId}-${traceContext.spanId}-01`;

// ─── Route helpers ───────────────────────────────────────────────────────────

/** Collapse high-cardinality path segments (IDs) into a stable :id placeholder. */
const sanitizeRouteSegment = (segment: string): string => {
    if (/^\d+$/.test(segment)) return ':id';
    if (/^[\da-f]{24}$/i.test(segment)) return ':id';
    if (/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(segment)) return ':id';
    return segment;
};

/**
 * Normalize a URL path to a stable metric label.
 * Example: /orders/660f1234abcd → /orders/:id
 */
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

// ─── Metric recording helpers ─────────────────────────────────────────────────

interface IRequestMetricInput {
    method: string;
    route: string;
    statusCode: number;
    durationMs: number;
}

/**
 * Record one completed HTTP request:
 * - increments the request counter
 * - observes the duration histogram
 * - increments the error counter when status >= 400
 */
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

/** Increment the in-flight gauge when a request starts. */
export const incrementInflight = (): void => {
    httpInflightRequests.inc();
};

/** Decrement the in-flight gauge when a request ends. */
export const decrementInflight = (): void => {
    httpInflightRequests.dec();
};

/** Serialize all registered metrics in Prometheus text format. */
export const getPrometheusMetrics = (): Promise<string> => metricsRegistry.metrics();
