import type { Request, Response } from 'express';
import { successResponse, rejectResponse } from '@utils/response';
import {
    getHttpRequestCounters,
    httpInflightRequests,
    getLatencyPercentiles
} from '@utils/observability';
import {
    authLoginTotal,
    authSignupTotal,
    cartCheckoutTotal,
    orderCreatedTotal
} from '@utils/domain-metrics';

/* Sum all label-value pairs for a counter. */
const sumValues = (values: Array<{ value: number }>) =>
    values.reduce((accumulator, v) => accumulator + v.value, 0);

/* Sum only entries whose label matches the given key/value pair. */
const sumByLabel = (
    values: Array<{ value: number; labels: Record<string, string | number | undefined> }>,
    labelKey: string,
    labelValue: string
) => values.filter((v) => v.labels[labelKey] === labelValue).reduce((accumulator, v) => accumulator + v.value, 0);

/**
 * GET /admin/metrics/summary
 * Key operational metrics as structured JSON for dashboard KPI cards.
 */
export const getAdminMetricsSummary = (_request: Request, response: Response) =>
    Promise.all([
        getHttpRequestCounters(),
        httpInflightRequests.get(),
        getLatencyPercentiles(),
        authLoginTotal.get(),
        authSignupTotal.get(),
        cartCheckoutTotal.get(),
        orderCreatedTotal.get()
    ])
        .then(
            ([
                { totalRequests, totalErrors },
                inflightMetric,
                latency,
                loginMetric,
                signupMetric,
                checkoutMetric,
                ordersMetric
            ]) => {
                const inFlight = sumValues(inflightMetric.values);
                const errorRate = totalRequests > 0 ? totalErrors / totalRequests : 0;

                successResponse(response, {
                    http: {
                        totalRequests,
                        totalErrors,
                        errorRate,
                        inFlight,
                        latencyMs: { p50: latency.p50, p95: latency.p95 }
                    },
                    auth: {
                        loginSuccess: sumByLabel(loginMetric.values, 'status', 'success'),
                        loginFailure: sumByLabel(loginMetric.values, 'status', 'failure'),
                        signupSuccess: sumByLabel(signupMetric.values, 'status', 'success')
                    },
                    business: {
                        checkoutSuccess: sumByLabel(checkoutMetric.values, 'status', 'success'),
                        ordersCreated: sumValues(ordersMetric.values)
                    },
                    process: {
                        uptimeSeconds: Math.floor(process.uptime()),
                        heapUsedMb: Math.round(process.memoryUsage().heapUsed / 1_048_576)
                    },
                    timestamp: new Date().toISOString()
                });
            }
        )
        .catch(() => rejectResponse(response, 500, 'Internal Server Error'));
