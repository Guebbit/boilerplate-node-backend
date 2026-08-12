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
        const statusCode = response.statusCode;
        const method = request.method;
        // A 4xx is the caller's fault and a 5xx is ours, so they must not share a severity.
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

        // `route` is the pattern, never the concrete path — an id in a log label explodes it.
        logger.log(level, `${method} ${route} ${statusCode} ${durationMs.toFixed(1)}ms`, {
            request_id: request.requestId,
            trace_id: getActiveSpanContext().traceId,
            method,
            route,
            status_code: statusCode,
            duration_ms: Math.round(durationMs * 100) / 100
        });
    });

    next();
};
