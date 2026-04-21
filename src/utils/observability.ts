import type { Request } from 'express';
import crypto from 'node:crypto';

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

interface IHistogramData {
    count: number;
    sum: number;
    bucketCounts: number[];
}

const HISTOGRAM_BUCKETS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000];
const requestCounter = new Map<string, number>();
const requestDurationHistogram = new Map<string, IHistogramData>();

const TRACE_ID_REGEX = /^[\da-f]{32}$/i;
const SPAN_ID_REGEX = /^[\da-f]{16}$/i;
const TRACEPARENT_REGEX = /^00-([\da-f]{32})-([\da-f]{16})-([\da-f]{2})$/i;

const escapePrometheusLabelValue = (value: string): string =>
    value
        .split('\\')
        .join(String.raw`\\`)
        .split('"')
        .join(String.raw`\"`)
        .split('\n')
        .join(String.raw`\n`);

const sanitizeRouteSegment = (segment: string): string => {
    // Normalize high-cardinality dynamic IDs to keep Prometheus labels stable.
    if (/^\d+$/.test(segment)) return ':id';
    if (/^[\da-f]{24}$/i.test(segment)) return ':id';
    if (
        /^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(segment)
    )
        return ':id';
    return segment;
};

export const normalizeRoutePath = (path: string): string => {
    const pathWithoutQueryString = path.split('?')[0] || '/';
    const segments = pathWithoutQueryString
        .split('/')
        .filter(Boolean)
        .map((segment) => sanitizeRouteSegment(segment));
    return segments.length > 0 ? `/${segments.join('/')}` : '/';
};

const toCounterKey = (method: string, route: string, statusCode: number): string =>
    [method.toUpperCase(), route, String(statusCode)].join('|');

const toHistogramKey = (method: string, route: string): string => [method.toUpperCase(), route].join('|');

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

export const createTraceContext = (incomingTraceparent: string | undefined): ITraceContext => {
    const parsed = parseTraceparent(incomingTraceparent);
    return {
        traceId: parsed.traceId ?? generateTraceId(),
        spanId: generateSpanId(),
        parentSpanId: parsed.parentSpanId
    };
};

export const toTraceparentHeader = (traceContext: ITraceContext): string =>
    `00-${traceContext.traceId}-${traceContext.spanId}-01`;

export const recordRequestMetric = ({
    method,
    route,
    statusCode,
    durationMs
}: IRequestMetricInput): void => {
    const counterKey = toCounterKey(method, route, statusCode);
    requestCounter.set(counterKey, (requestCounter.get(counterKey) ?? 0) + 1);

    const histogramKey = toHistogramKey(method, route);
    const existing = requestDurationHistogram.get(histogramKey) ?? {
        count: 0,
        sum: 0,
        bucketCounts: Array.from({ length: HISTOGRAM_BUCKETS_MS.length }, () => 0)
    };

    existing.count += 1;
    existing.sum += durationMs;
    for (const [index, bucket] of HISTOGRAM_BUCKETS_MS.entries()) {
        if (durationMs <= bucket) {
            existing.bucketCounts[index] += 1;
            break;
        }
    }
    requestDurationHistogram.set(histogramKey, existing);
};

const toMethodRouteLabels = (
    key: string
): {
    method: string;
    route: string;
} => {
    const [method = 'GET', route = '/'] = key.split('|');
    return { method, route };
};

const renderCounterMetrics = (): string[] => {
    const lines = [
        '# HELP http_requests_total Total number of HTTP requests handled.',
        '# TYPE http_requests_total counter'
    ];

    for (const [key, value] of requestCounter.entries()) {
        const [method = 'GET', route = '/', statusCode = '200'] = key.split('|');
        lines.push(
            `http_requests_total{method="${escapePrometheusLabelValue(method)}",route="${escapePrometheusLabelValue(route)}",status_code="${escapePrometheusLabelValue(statusCode)}"} ${value}`
        );
    }

    return lines;
};

const renderHistogramMetrics = (): string[] => {
    const lines = [
        '# HELP http_request_duration_milliseconds HTTP request duration in milliseconds.',
        '# TYPE http_request_duration_milliseconds histogram'
    ];

    for (const [key, value] of requestDurationHistogram.entries()) {
        const labels = toMethodRouteLabels(key);
        let cumulative = 0;
        for (const [index, bucket] of HISTOGRAM_BUCKETS_MS.entries()) {
            cumulative += value.bucketCounts[index] ?? 0;
            lines.push(
                `http_request_duration_milliseconds_bucket{method="${escapePrometheusLabelValue(labels.method)}",route="${escapePrometheusLabelValue(labels.route)}",le="${bucket}"} ${cumulative}`
            );
        }
        lines.push(
            `http_request_duration_milliseconds_bucket{method="${escapePrometheusLabelValue(labels.method)}",route="${escapePrometheusLabelValue(labels.route)}",le="+Inf"} ${value.count}`,
            `http_request_duration_milliseconds_sum{method="${escapePrometheusLabelValue(labels.method)}",route="${escapePrometheusLabelValue(labels.route)}"} ${value.sum}`,
            `http_request_duration_milliseconds_count{method="${escapePrometheusLabelValue(labels.method)}",route="${escapePrometheusLabelValue(labels.route)}"} ${value.count}`
        );
    }

    return lines;
};

const renderProcessMetrics = (): string[] => {
    const memoryUsage = process.memoryUsage();

    return [
        '# HELP process_uptime_seconds Uptime of the Node.js process.',
        '# TYPE process_uptime_seconds gauge',
        `process_uptime_seconds ${process.uptime().toFixed(3)}`,
        '# HELP process_resident_memory_bytes Resident memory size in bytes.',
        '# TYPE process_resident_memory_bytes gauge',
        `process_resident_memory_bytes ${memoryUsage.rss}`
    ];
};

export const getPrometheusMetrics = (): string =>
    [...renderCounterMetrics(), ...renderHistogramMetrics(), ...renderProcessMetrics(), ''].join('\n');

export const getRouteLabel = (request: Request): string =>
    normalizeRoutePath(request.path || request.originalUrl || '/');
