/**
 * @module
 * Guards the Prometheus scrape endpoint with a static bearer credential. Not rate limiting — it
 * is a static-bearer auth guard for this module's one route, `GET /observability/metrics`, so it
 * lives beside the route it guards rather than in
 * `infrastructure/http/middlewares/rate-limit.ts`, and stays off the module's barrel: it is
 * wiring, not published language.
 */

import type { NextFunction, Request, Response } from 'express';
import { constantTimeEqual } from '@infrastructure/security/constant-time';
import { rejectResponse } from '@infrastructure/http/response';
import { logger } from '@infrastructure/adapters/logger';

/**
 * Guards the Prometheus scrape endpoint with a static bearer credential — Prometheus cannot hold a
 * session, so the bearer token the other observability routes check
 * `platform.observability.any.read` on is not available to it.
 *
 * DENY by default when `NODE_METRICS_TOKEN` is unset, and `constantTimeEqual` rather than `===`,
 * which would leak the token's prefix to anyone willing to measure.
 *
 * See: docs/tools/security.md#why-the-metrics-endpoint-has-its-own-credential
 */
export const isMetricsScraper = (request: Request, response: Response, next: NextFunction) => {
    const expected = process.env.NODE_METRICS_TOKEN;

    if (!expected) {
        logger.warn({
            message:
                'NODE_METRICS_TOKEN is not set — /observability/metrics is refusing every request.'
        });
        rejectResponse(response, 503, []);
        return;
    }

    // The scheme is required, not stripped-if-present: a bare token would mean the credential is
    // read from a header shape no client should be sending — one more way for it to leak.
    const authorization = request.header('Authorization') ?? '';
    const provided = authorization.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length)
        : '';

    if (!constantTimeEqual(expected, provided)) {
        rejectResponse(response, 401, []);
        return;
    }

    next();
};
