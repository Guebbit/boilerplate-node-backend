import type { Request, Response, NextFunction } from 'express';
import { logger } from '@utils/winston';
import { getRouteLabel } from '@utils/observability';
import { getActiveSpanContext } from '@utils/tracer';

// One slim access log per request. Anything richer lives in Tempo (traces).
export const requestLogger = (request: Request, response: Response, next: NextFunction): void => {
    const startTime = process.hrtime.bigint();

    response.once('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        const route = getRouteLabel(request);
        const statusCode = response.statusCode;
        const method = request.method;
        const level = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';

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
