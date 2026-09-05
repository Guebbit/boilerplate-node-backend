/**
 * @module
 * Controller for `GET /observability/metrics/overview`. Resolves each domain counter by metric
 * NAME off the shared prom-client registry rather than importing it — see `readCounter` below for
 * why, and `module-coupling-observability` in `.dependency-cruiser.cjs`, which keeps this module
 * from reaching any domain beyond `audit-logs`.
 *
 * See: docs/modules/observability.md
 */

import type { Request, Response } from 'express';
import type { ObservabilityMetricsSummary } from '@types';
import { successResponse } from '@infrastructure/http/response';
import { catchAs } from '@infrastructure/http/controller';
import {
    getHttpRequestCounters,
    httpInflightRequests,
    getLatencyPercentiles,
    metricsRegistry
} from '@infrastructure/observability/metrics-http';
import { processSnapshot } from '@infrastructure/observability/process-snapshot';

/** One sample of a prom-client counter. */
interface MetricSample {
    value: number;
    labels: Record<string, string | number | undefined>;
}

/**
 * Read a domain counter's samples by metric NAME rather than by importing the counter.
 *
 * This is what keeps the dashboard from depending on the domains it reports on. The counters
 * belong to `account`, `cart` and `orders` now; importing them would couple this module to three
 * domains and make deleting any of them a compile error here — in the one place whose whole job is
 * to survive them. `module-coupling-observability` in `.dependency-cruiser.cjs` keeps it that way:
 * this module may reach `audit-logs` and nothing else.
 *
 * An absent metric is a normal state, not an error: it means the module that owns it is not in
 * this build, and the overview reports zero for that row. The response shape is fixed by
 * `openapi.yaml` and is the same either way, so a client never has to know which modules exist.
 */
const readCounter = async (name: string): Promise<MetricSample[]> => {
    const metric = metricsRegistry.getSingleMetric(name);
    if (!metric) return [];
    const result = (await metric.get()) as { values?: MetricSample[] };
    return result.values ?? [];
};

/**
 * Sum values for a specific label across a prom-client metric result.
 */
const sumByLabel = (values: MetricSample[], labelKey: string, labelValue: string): number =>
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
        // Gauges, but read identically: `collect` recounts at scrape time, and an absent metric
        // (inventory module deleted) reads as zero like every other row here.
        readCounter('products_low_stock_total'),
        readCounter('inventory_reserved_units_total'),
        readCounter('db_queries_total'),
        readCounter('db_errors_total')
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
                lowStockValues,
                reservedValues,
                databaseQueryValues,
                databaseErrorValues
            ]) => {
                const snapshot = processSnapshot();
                const inFlight = inflightMetric.values.reduce((s, v) => s + v.value, 0);

                const data: ObservabilityMetricsSummary = {
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
                        lowStockProducts: lowStockValues.reduce((s, v) => s + v.value, 0),
                        reservedUnits: reservedValues.reduce((s, v) => s + v.value, 0)
                    },
                    database: {
                        queriesTotal: databaseQueryValues.reduce((s, v) => s + v.value, 0),
                        errorsTotal: databaseErrorValues.reduce((s, v) => s + v.value, 0)
                    },
                    process: {
                        uptimeSeconds: snapshot.uptimeSeconds,
                        memory: snapshot.memory
                    },
                    timestamp: new Date().toISOString()
                };

                successResponse<ObservabilityMetricsSummary>(response, data);
            }
        )
        .catch(catchAs(response, 'getObservabilityMetricsOverview'));
