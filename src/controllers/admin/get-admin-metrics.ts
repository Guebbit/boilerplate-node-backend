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

/**
 * Sum values for a specific label across a prom-client metric result.
 */
const sumByLabel = (
    values: Array<{ value: number; labels: Record<string, string | number | undefined> }>,
    labelKey: string,
    labelValue: string
): number =>
    values.filter((v) => v.labels[labelKey] === labelValue).reduce((sum, v) => sum + v.value, 0);

/**
 * GET /admin/metrics
 * Structured JSON summary of key operational metrics.
 */
export const getAdminMetrics = (_request: Request, response: Response) =>
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
                loginMetrics,
                signupMetrics,
                checkoutMetrics,
                orderMetrics
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
                        loginSuccess: sumByLabel(loginMetrics.values, 'status', 'success'),
                        loginFailure: sumByLabel(loginMetrics.values, 'status', 'failure'),
                        signupSuccess: sumByLabel(signupMetrics.values, 'status', 'success')
                    },
                    business: {
                        checkoutSuccess: sumByLabel(checkoutMetrics.values, 'status', 'success'),
                        ordersCreated: orderMetrics.values.reduce((s, v) => s + v.value, 0)
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
            rejectResponse(response, 500, 'metrics unavailable');
        });
