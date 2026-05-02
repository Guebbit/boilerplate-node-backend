import type { Request, Response, NextFunction } from 'express';
import { logger } from '@utils/winston';
import { getRouteLabel } from '@utils/observability';

// Headers that should be masked in request logs.
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie']);

// Keep only useful headers and redact sensitive ones.
const sanitizeHeaders = (headers: Request['headers']): Record<string, string> => {
    const useful = ['content-type', 'user-agent', 'accept', 'x-forwarded-for', 'x-real-ip'];
    const result: Record<string, string> = {};

    for (const name of useful) {
        const value = headers[name];
        if (!value) continue;
        result[name] = SENSITIVE_HEADERS.has(name) ? '[REDACTED]' : String(value);
    }

    return result;
};

// Emit one structured access log when the response finishes.
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
            trace_id: request.traceContext?.traceId,
            span_id: request.traceContext?.spanId,
            parent_span_id: request.traceContext?.parentSpanId,
            method,
            route,
            status_code: statusCode,
            duration_ms: Math.round(durationMs * 100) / 100,
            user_id: request.user?.id ?? undefined,
            ip: request.ip,
            headers: sanitizeHeaders(request.headers)
        });
    });

    next();
};
