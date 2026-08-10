/**
 * Per-request context: the correlation id, the access log, the observability handle, the locale.
 *
 * Everything here attaches something the rest of the request reads, which is why it is one group
 * and why it must precede the routes. The internal order is load-bearing too: the request id is
 * generated first because the access log and every audit entry record it.
 */

import crypto from 'node:crypto';
import type { Express } from 'express';
import { requestLogger } from '@middlewares/request-logger';
import { attachObservability } from '@middlewares/observability';
import { attachLocale } from '@middlewares/locale';

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
        const requestId = request.get('x-request-id') ?? crypto.randomUUID();
        request.requestId = requestId;
        response.setHeader('x-request-id', requestId);
        next();
    });

    /*
     * Winston access log + OpenTelemetry trace injection
     */
    app.use(requestLogger);

    /*
     * Attach observability context — controllers use request.obs instead of singletons
     */
    app.use(attachObservability);

    /*
     * Negotiate Accept-Language and run the request inside that locale — must precede the routes,
     * since everything downstream resolves its user-facing copy against it
     */
    app.use(attachLocale);
};
