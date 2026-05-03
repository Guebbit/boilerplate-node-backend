import type { Request, Response } from 'express';
import type { MetricObjectWithValues, MetricValue } from 'prom-client';
import { metricsRegistry } from '@utils/observability';
import { successResponse, rejectResponse } from '@utils/response';

type MetricFamily = MetricObjectWithValues<MetricValue<string>>;

/** Find the first numeric value of a named metric in the JSON array. */
const findMetricValue = (
    metrics: MetricFamily[],
    name: string,
    labelFilter?: Record<string, string>
): number => {
    const family = metrics.find((m) => m.name === name);
    if (!family) return 0;
    if (!labelFilter) return family.values[0]?.value ?? 0;
    const match = family.values.find((v) =>
        Object.entries(labelFilter).every(([k, value]) => String(v.labels[k] ?? '') === value)
    );
    return match?.value ?? 0;
};

/** Sum all values of a named metric. */
const sumMetricValues = (metrics: MetricFamily[], name: string): number =>
    metrics
        .find((m) => m.name === name)
        ?.values.reduce((accumulator, v) => accumulator + v.value, 0) ?? 0;

/** Extract p50/p95 from a histogram metric using cumulative bucket counts. */
const extractHistogramPercentiles = (
    metrics: MetricFamily[],
    bucketName: string
): { p50: number; p95: number } => {
    const family = metrics.find((m) => m.name === `${bucketName}_bucket`);
    if (!family || family.values.length === 0) return { p50: 0, p95: 0 };

    // Group bucket values by label set (excluding "le").
    const buckets = family.values
        .filter((v) => v.labels['le'] !== '+Inf')
        .map((v) => ({ le: Number(v.labels['le']), count: v.value }))
        .toSorted((a, b) => a.le - b.le);

    const totalCountFamily = metrics.find((m) => m.name === `${bucketName}_count`);
    const total = totalCountFamily?.values[0]?.value ?? 0;
    if (total === 0 || buckets.length === 0) return { p50: 0, p95: 0 };

    const findPercentile = (pct: number): number => {
        const target = total * pct;
        for (const bucket of buckets) {
            if (bucket.count >= target) return bucket.le;
        }
        return buckets.at(-1)?.le ?? 0;
    };

    return { p50: findPercentile(0.5), p95: findPercentile(0.95) };
};

/** Returns key operational metrics as JSON for the admin dashboard. */
export const getAdminMetricsSummary = (_request: Request, response: Response): void => {
    void metricsRegistry
        .getMetricsAsJSON()
        .then((metrics) => {
            const m = metrics as MetricFamily[];

            const totalRequests = sumMetricValues(m, 'http_requests_total');
            const totalErrors = sumMetricValues(m, 'http_request_errors_total');
            const errorRate =
                totalRequests > 0 ? Number((totalErrors / totalRequests).toFixed(4)) : 0;
            const inFlight = findMetricValue(m, 'http_requests_in_flight');
            const uptimeSeconds = findMetricValue(m, 'process_uptime_seconds');
            const heapUsedBytes = findMetricValue(m, 'nodejs_heap_size_used_bytes');
            const latency = extractHistogramPercentiles(m, 'http_request_duration_milliseconds');

            const authLoginSuccess = findMetricValue(m, 'auth_login_total', { status: 'success' });
            const authLoginFailure = findMetricValue(m, 'auth_login_total', { status: 'failure' });
            const authSignupSuccess = findMetricValue(m, 'auth_signup_total', {
                status: 'success'
            });
            const checkoutSuccess = findMetricValue(m, 'cart_checkout_total', {
                status: 'success'
            });
            const ordersCreated = findMetricValue(m, 'order_created_total');

            const databaseQueriesTotal = sumMetricValues(m, 'db_query_total');
            const databaseErrorsTotal = sumMetricValues(m, 'db_errors_total');

            return successResponse(
                response,
                {
                    http: {
                        totalRequests,
                        totalErrors,
                        errorRate,
                        inFlight,
                        latencyMs: latency
                    },
                    auth: {
                        loginSuccess: authLoginSuccess,
                        loginFailure: authLoginFailure,
                        signupSuccess: authSignupSuccess
                    },
                    business: {
                        checkoutSuccess,
                        ordersCreated
                    },
                    database: {
                        queriesTotal: databaseQueriesTotal,
                        errorsTotal: databaseErrorsTotal
                    },
                    process: {
                        uptimeSeconds,
                        heapUsedMb: Math.round(heapUsedBytes / 1024 / 1024)
                    },
                    timestamp: new Date().toISOString()
                },
                200,
                'Metrics summary'
            );
        })
        .catch(() => rejectResponse(response, 500, 'Metrics unavailable'));
};
