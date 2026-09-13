/**
 * @module
 * Access-log middleware — one line per request, timed with `hrtime` for sub-millisecond precision,
 * with a severity derived from the response's own status so a 5xx surfaces as loud as the failure
 * it is.
 */

import type { Request, Response, NextFunction } from 'express';
import { logger } from '@infrastructure/adapters/logger';
import { getRouteLabel } from '@infrastructure/observability/metrics-http';
import { getActiveSpanContext } from '@infrastructure/observability/tracer';

/**
 * Express middleware that emits one access-log entry per request.
 * Uses hrtime for sub-millisecond duration, logs WARN for 4xx, ERROR for 5xx.
 */
export const requestLogger = (request: Request, response: Response, next: NextFunction): void => {
    const startTime = process.hrtime.bigint();

    // `finish` rather than `close`: the entry describes a response that was actually sent.
    response.once('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        const route = getRouteLabel(request);
        const { statusCode } = response;
        const { method, requestId } = request;
        // A 4xx is the caller's fault and a 5xx is ours, so they must not share a severity.
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

        // `route` is the matched template, never the concrete path — read here rather than
        // before `next()` because that is when Express has populated it.
        logger.log(level, `${method} ${route} ${statusCode} ${durationMs.toFixed(1)}ms`, {
            request_id: requestId,
            trace_id: getActiveSpanContext().traceId,
            method,
            route,
            status_code: statusCode,
            duration_ms: Math.round(durationMs * 100) / 100
        });
    });

    next();
};
