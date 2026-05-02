import type { Request, Response, NextFunction } from 'express';
import { logger } from '@utils/winston';
import { getRouteLabel } from '@utils/observability';

// ---------------------------------------------------------------------------
// Sensitive header redaction
// ---------------------------------------------------------------------------

/**
 * Request headers whose values must be hidden in access logs.
 *
 * The `Authorization` header contains bearer tokens; `cookie` may hold
 * refresh-token cookies.  Both are stripped before the log entry is written.
 */
const SENSITIVE_HEADERS = new Set(['authorization', 'cookie', 'set-cookie']);

/**
 * Build a sanitised copy of the request headers map, replacing the values of
 * sensitive headers with `[REDACTED]`.
 *
 * Only a small, useful subset of headers is forwarded to avoid bloating every
 * log entry with low-value noise.
 */
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

// ---------------------------------------------------------------------------
// Request logger middleware
// ---------------------------------------------------------------------------

/**
 * Structured HTTP access-log middleware.
 *
 * Attaches a `finish` listener to the response so the log entry is written
 * **after** the response has been sent.  This guarantees that `status_code`
 * and `duration_ms` are always present.
 *
 * Log shape (all fields are always present unless marked optional):
 * ```json
 * {
 *   "timestamp": "2024-01-15T10:30:45.123Z",
 *   "level": "info",
 *   "message": "GET /products 200 42ms",
 *   "request_id": "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
 *   "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
 *   "span_id":  "1111111111111111",
 *   "method": "GET",
 *   "route": "/products",
 *   "status_code": 200,
 *   "duration_ms": 42.3,
 *   "user_id": "660f1234abcd1234abcd1234",   ← optional, present when authenticated
 *   "ip": "::1",
 *   "headers": { "content-type": "application/json", "user-agent": "..." }
 * }
 * ```
 *
 * Usage — mount *after* the request-id and trace-context middlewares:
 * ```ts
 * app.use(requestLogger);
 * ```
 */
export const requestLogger = (request: Request, response: Response, next: NextFunction): void => {
    // Record high-resolution start time; `process.hrtime.bigint()` is
    // monotonic so it is immune to wall-clock adjustments (NTP slew, DST, …).
    const startTime = process.hrtime.bigint();

    // Attach to `finish` so the log line is written only when the response is
    // fully flushed.  Using `once` prevents double-firing on keep-alive connections.
    response.once('finish', () => {
        const durationMs = Number(process.hrtime.bigint() - startTime) / 1_000_000;

        // Normalise the route path to a stable label (e.g. /orders/660f… → /orders/:id)
        const route = getRouteLabel(request);

        const statusCode = response.statusCode;
        const method = request.method;

        // Choose an appropriate log level based on response status:
        //   5xx → error, 4xx → warn, everything else → info
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
            // user_id is populated by auth middleware upstream; may be absent for
            // unauthenticated requests.
            user_id: request.user?.id ?? undefined,
            ip: request.ip,
            headers: sanitizeHeaders(request.headers)
        });
    });

    next();
};
