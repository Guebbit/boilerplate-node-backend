import type { MetricObjectWithValues, MetricValue } from 'prom-client';
import mongoose from 'mongoose';
import os from 'node:os';
import { getRecentAuditEvents } from '@utils/audit';
import { isPostHogEnabled } from '@utils/analytics';
import { metricsRegistry } from '@utils/observability';
import { isLokiEnabled } from '@utils/winston';

type MetricFamily = MetricObjectWithValues<MetricValue<string>>;

interface IAuditLogFilters {
    actor?: string;
    action?: string;
    outcome?: 'success' | 'failure';
    since?: string;
    limit: number;
}

const findMetricValue = (
    metrics: MetricFamily[],
    name: string,
    labelFilter?: Record<string, string>
): number => {
    const family = metrics.find((metric) => metric.name === name);
    if (!family) return 0;
    if (!labelFilter) return family.values[0]?.value ?? 0;
    const match = family.values.find((valueItem) =>
        Object.entries(labelFilter).every(
            ([key, labelValue]) => String(valueItem.labels[key] ?? '') === labelValue
        )
    );
    return match?.value ?? 0;
};

const sumMetricValues = (metrics: MetricFamily[], name: string): number =>
    metrics
        .find((metric) => metric.name === name)
        ?.values.reduce((accumulator, valueItem) => accumulator + valueItem.value, 0) ?? 0;

const extractHistogramPercentiles = (
    metrics: MetricFamily[],
    bucketName: string
): { p50: number; p95: number } => {
    const family = metrics.find((metric) => metric.name === `${bucketName}_bucket`);
    if (!family || family.values.length === 0) return { p50: 0, p95: 0 };

    const buckets = family.values
        .filter((valueItem) => valueItem.labels['le'] !== '+Inf')
        .map((valueItem) => ({ le: Number(valueItem.labels['le']), count: valueItem.value }))
        .toSorted((a, b) => a.le - b.le);

    const totalCountFamily = metrics.find((metric) => metric.name === `${bucketName}_count`);
    const total = totalCountFamily?.values[0]?.value ?? 0;
    if (total === 0 || buckets.length === 0) return { p50: 0, p95: 0 };

    const findPercentile = (percentile: number): number => {
        const target = total * percentile;
        for (const bucket of buckets) {
            if (bucket.count >= target) return bucket.le;
        }
        return buckets.at(-1)?.le ?? 0;
    };

    return { p50: findPercentile(0.5), p95: findPercentile(0.95) };
};

const getHealthSummary = () => {
    const { readyState } = mongoose.connection;
    const databaseStatus =
        readyState === 1 ? 'connected' : readyState === 2 ? 'connecting' : 'disconnected';
    const memoryUsage = process.memoryUsage();

    return {
        status: 'ok',
        environment: process.env.NODE_ENV ?? 'development',
        service: process.env.NODE_SERVICE_NAME ?? 'api',
        nodeVersion: process.version,
        uptimeSeconds: Math.floor(process.uptime()),
        database: { status: databaseStatus },
        integrations: {
            loki: isLokiEnabled(),
            posthog: isPostHogEnabled(),
            otelEnabled: Boolean(process.env.NODE_OTEL_ENABLED !== '0')
        },
        memory: {
            heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
            rssMb: Math.round(memoryUsage.rss / 1024 / 1024)
        },
        system: {
            platform: os.platform(),
            cpuCount: os.cpus().length,
            loadAvg: os.loadavg()
        },
        timestamp: new Date().toISOString()
    };
};

const getMetricsSummary = (): Promise<{
    http: {
        totalRequests: number;
        totalErrors: number;
        errorRate: number;
        inFlight: number;
        latencyMs: { p50: number; p95: number };
    };
    auth: { loginSuccess: number; loginFailure: number; signupSuccess: number };
    business: { checkoutSuccess: number; ordersCreated: number };
    database: { queriesTotal: number; errorsTotal: number };
    process: { uptimeSeconds: number; heapUsedMb: number };
    timestamp: string;
}> =>
    metricsRegistry.getMetricsAsJSON().then((metrics) => {
        const metricFamilies = metrics as MetricFamily[];
        const totalRequests = sumMetricValues(metricFamilies, 'http_requests_total');
        const totalErrors = sumMetricValues(metricFamilies, 'http_request_errors_total');
        const errorRate = totalRequests > 0 ? Number((totalErrors / totalRequests).toFixed(4)) : 0;
        const inFlight = findMetricValue(metricFamilies, 'http_requests_in_flight');
        const uptimeSeconds = findMetricValue(metricFamilies, 'process_uptime_seconds');
        const heapUsedBytes = findMetricValue(metricFamilies, 'nodejs_heap_size_used_bytes');

        return {
            http: {
                totalRequests,
                totalErrors,
                errorRate,
                inFlight,
                latencyMs: extractHistogramPercentiles(
                    metricFamilies,
                    'http_request_duration_milliseconds'
                )
            },
            auth: {
                loginSuccess: findMetricValue(metricFamilies, 'auth_login_total', {
                    status: 'success'
                }),
                loginFailure: findMetricValue(metricFamilies, 'auth_login_total', {
                    status: 'failure'
                }),
                signupSuccess: findMetricValue(metricFamilies, 'auth_signup_total', {
                    status: 'success'
                })
            },
            business: {
                checkoutSuccess: findMetricValue(metricFamilies, 'cart_checkout_total', {
                    status: 'success'
                }),
                ordersCreated: findMetricValue(metricFamilies, 'order_created_total')
            },
            database: {
                queriesTotal: sumMetricValues(metricFamilies, 'db_query_total'),
                errorsTotal: sumMetricValues(metricFamilies, 'db_errors_total')
            },
            process: {
                uptimeSeconds,
                heapUsedMb: Math.round(heapUsedBytes / 1024 / 1024)
            },
            timestamp: new Date().toISOString()
        };
    });

const getAuditLogs = ({ actor, action, outcome, since, limit }: IAuditLogFilters) => {
    const items = getRecentAuditEvents({ actor, action, outcome, since, limit });
    return { items, total: items.length };
};

export const adminService = { getHealthSummary, getMetricsSummary, getAuditLogs };
