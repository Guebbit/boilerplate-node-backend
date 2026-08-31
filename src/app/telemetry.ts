/**
 * @module
 * Prometheus HTTP metrics.
 *
 * Mounted before the routes so the timer wraps the handler rather than following it. The route
 * label is read in the `finish` listener, not here: `request.route` is populated during routing,
 * so a label taken in the middleware body would have to guess at the template from the path — and
 * a guess is unbounded for every path the app does not serve.
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
