import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@infrastructure/http/response';
import {
    getHttpRequestCounters,
    httpInflightRequests,
    getLatencyPercentiles,
    metricsRegistry
} from '@infrastructure/observability/metrics-http';

/** One sample of a prom-client counter. */
interface IMetricSample {
    value: number;
    labels: Record<string, string | number | undefined>;
}

/**
 * Read a domain counter's samples by metric NAME rather than by importing the counter.
 *
 * This is what keeps the dashboard from depending on the domains it reports on. The counters
 * belong to `account`, `cart` and `orders` now; importing them would give this module a
 * `dependsOn` on three domains and make deleting any of them a compile error here — in the one
 * place whose whole job is to survive them.
 *
 * An absent metric is a normal state, not an error: it means the module that owns it is not in
 * this build, and the overview reports zero for that row. The response shape is fixed by
 * `openapi.yaml` and is the same either way, so a client never has to know which modules exist.
 */
const readCounter = async (name: string): Promise<IMetricSample[]> => {
    const metric = metricsRegistry.getSingleMetric(name);
    if (!metric) return [];
    const result = (await metric.get()) as { values?: IMetricSample[] };
    return result.values ?? [];
};

/**
 * Sum values for a specific label across a prom-client metric result.
 */
const sumByLabel = (values: IMetricSample[], labelKey: string, labelValue: string): number =>
    values.filter((v) => v.labels[labelKey] === labelValue).reduce((sum, v) => sum + v.value, 0);

/**
 * GET /observability/metrics/overview
 * Structured JSON overview of key operational metrics.
 */
export const getObservabilityMetricsOverview = (_request: Request, response: Response) =>
    Promise.all([
        getHttpRequestCounters(),
        httpInflightRequests.get(),
        getLatencyPercentiles(),
        readCounter('auth_login_total'),
        readCounter('auth_signup_total'),
        readCounter('cart_checkout_total'),
        readCounter('order_created_total'),
        // A gauge, but read identically: `collect` recounts the shelf at scrape time, and an
        // absent metric (inventory module deleted) reads as zero like every other row here.
        readCounter('products_low_stock_total')
    ])
        .then(
            ([
                { totalRequests, totalErrors },
                inflightMetric,
                latency,
                loginValues,
                signupValues,
                checkoutValues,
                orderValues,
                lowStockValues
            ]) => {
                const mem = process.memoryUsage();
                const inFlight = inflightMetric.values.reduce((s, v) => s + v.value, 0);

                const data = {
                    http: {
                        totalRequests,
                        totalErrors,
                        errorRate: totalRequests > 0 ? totalErrors / totalRequests : 0,
                        inFlight,
                        latencyMs: { p50: latency.p50, p95: latency.p95 }
                    },
                    auth: {
                        loginSuccess: sumByLabel(loginValues, 'status', 'success'),
                        loginFailure: sumByLabel(loginValues, 'status', 'failure'),
                        signupSuccess: sumByLabel(signupValues, 'status', 'success')
                    },
                    business: {
                        checkoutSuccess: sumByLabel(checkoutValues, 'status', 'success'),
                        ordersCreated: orderValues.reduce((s, v) => s + v.value, 0),
                        lowStockProducts: lowStockValues.reduce((s, v) => s + v.value, 0)
                    },
                    database: {
                        queriesTotal: 0,
                        errorsTotal: 0
                    },
                    process: {
                        uptimeSeconds: Math.floor(process.uptime()),
                        heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024)
                    },
                    timestamp: new Date().toISOString()
                };

                successResponse(response, data);
            }
        )
        .catch(() => {
            rejectResponse(response, 500);
        });
