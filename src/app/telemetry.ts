/**
 * Prometheus HTTP metrics.
 *
 * Mounted after the request context so `getRouteLabel` can read a request the rest of the stack has
 * already annotated, and before the routes so the timer wraps the handler rather than following it.
 */

import type { Express } from 'express';
import {
    getRouteLabel,
    recordRequestMetric,
    incrementInflight,
    decrementInflight
} from '@infrastructure/observability/metrics-http';

/**
 * Install per-request latency and in-flight instrumentation.
 *
 * @param app - the express application to configure
 */
export const installTelemetry = (app: Express): void => {
    /*
     * Prometheus HTTP metrics — track latency and in-flight requests
     */
    app.use((request, response, next) => {
        incrementInflight();
        const startTime = process.hrtime.bigint();
        response.once('finish', () => {
            decrementInflight();
            const elapsedTimeInMilliseconds =
                Number(process.hrtime.bigint() - startTime) / 1_000_000;
            recordRequestMetric({
                method: request.method,
                route: getRouteLabel(request),
                statusCode: response.statusCode,
                durationMs: elapsedTimeInMilliseconds
            });
        });
        next();
    });
};
