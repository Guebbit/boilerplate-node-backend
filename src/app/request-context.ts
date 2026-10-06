/**
 * @module
 * Per-request context: the access log, the observability handle, the locale.
 *
 * Everything here attaches something the rest of the request reads, which is why it is one group
 * and why it must precede the routes. The request id is the exception: it is
 * mounted earlier (`requestIdMiddleware`), because the access log and every audit entry record it.
 */

import crypto from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import { requestLogger } from '@infrastructure/http/middlewares/request-logger';
import { attachLocale } from '@infrastructure/http/middlewares/locale';

/**
 * Matches a canonical UUID (any RFC 4122 version/variant) — the only shape `x-request-id` is
 * trusted in from a client. This value reaches Winston and every audit
 * entry verbatim, so an unvalidated one is a log-injection vector (newlines, control characters,
 * an arbitrarily long string) rather than just a correlation id.
 */
const REQUEST_ID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

/**
 * Request ID middleware — reuse a well-formed client ID or generate a new UUID.
 *
 * Mounted by `createApp` before `installSecurity`, so even a request the global rate limiter
 * refuses carries `x-request-id` (the access log, which stays after the limiter, never sees it).
 */
export const requestIdMiddleware: RequestHandler = (request, response, next) => {
    const clientRequestId = request.get('x-request-id');
    const requestId =
        clientRequestId && REQUEST_ID_PATTERN.test(clientRequestId)
            ? clientRequestId
            : crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
};

/**
 * Install access logging, the observability context and locale negotiation.
 *
 * @param app - the express application to configure
 */
export const installRequestContext = (app: Express): void => {
    /*
     * Winston access log + OpenTelemetry trace injection
     */
    app.use(requestLogger);

    /*
     * Negotiate Accept-Language and run the request inside that locale — must precede the routes,
     * since everything downstream resolves its user-facing copy against it
     */
    app.use(attachLocale);
};
