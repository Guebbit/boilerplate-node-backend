/**
 * @module
 * Per-request context: the correlation id, the access log, the observability handle, the locale.
 *
 * Everything here attaches something the rest of the request reads, which is why it is one group
 * and why it must precede the routes. The internal order is load-bearing too: the request id is
 * generated first because the access log and every audit entry record it.
 */

import crypto from 'node:crypto';
import type { Express } from 'express';
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
 * Install request-id generation, access logging, the observability context and locale negotiation.
 *
 * @param app - the express application to configure
 */
export const installRequestContext = (app: Express): void => {
    /*
     * Request ID middleware — reuse client ID or generate new UUID
     */
    app.use((request, response, next) => {
        const clientRequestId = request.get('x-request-id');
        const requestId =
            clientRequestId && REQUEST_ID_PATTERN.test(clientRequestId)
                ? clientRequestId
                : crypto.randomUUID();
        request.requestId = requestId;
        response.setHeader('x-request-id', requestId);
        next();
    });

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
