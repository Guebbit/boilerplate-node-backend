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
import { tracingConfig } from '@infrastructure/runtime/config';

/**
 * Matches a canonical UUID (any RFC 4122 version/variant) — the only shape `x-request-id` is
 * recorded from a client. This value reaches Winston and every audit
 * entry verbatim, so an unvalidated one is a log-injection vector (newlines, control characters,
 * an arbitrarily long string) rather than just a correlation id.
 */
const REQUEST_ID_PATTERN = /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i;

/**
 * Request ID middleware — always a fresh UUID, with the caller's own id kept beside it.
 *
 * A well-formed `x-request-id` becomes `request.clientRequestId` (logged and audited as
 * `client_request_id`, the shape an AWS ALB gives its own id), never `request.requestId`: the id
 * this service answers with is one it chose. Behind a trusted ingress (`NODE_TRUSTED_INGRESS`)
 * the ingress vouches for the header, so the client value IS the request id.
 *
 * Mounted by `createApp` before `installSecurity`, so even a request the global rate limiter
 * refuses carries `x-request-id` (the access log, which stays after the limiter, never sees it).
 */
export const requestIdMiddleware: RequestHandler = (request, response, next) => {
    const header = request.get('x-request-id');
    const clientRequestId = header && REQUEST_ID_PATTERN.test(header) ? header : undefined;
    const requestId =
        clientRequestId && tracingConfig().NODE_TRUSTED_INGRESS
            ? clientRequestId
            : crypto.randomUUID();
    request.requestId = requestId;
    request.clientRequestId = clientRequestId;
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
