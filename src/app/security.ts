/**
 * @module
 * Transport-level protections and body parsing, grouped because the order matters and isn't
 * obvious: `trust proxy` before the rate limiter (which keys buckets on `request.ip`), body
 * parsers before anything reading `request.body`. Infrastructure supplies the handlers; this
 * decides which ones this application installs, and in what order.
 *
 * See: docs/tools/security.md#main-security-tools
 */

import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { logger } from '@infrastructure/adapters/logger';

/**
 * `express.json()`/`express.urlencoded()`'s own default (`100kb`) is already a bound, but an
 * implicit one nobody reading this file would find — BETTER_SECURITY.md 3.3e. Explicit and
 * configurable, same shape as `NODE_MAX_UPLOAD_BYTES` for multipart bodies.
 */
const JSON_BODY_LIMIT = process.env.NODE_JSON_BODY_LIMIT ?? '100kb';

/**
 * Origins allowed to call this API with credentials, from `NODE_CORS_ORIGIN`.
 *
 * Separated by comma if multiple; blank entries are dropped so a trailing comma cannot add an
 * empty origin to the set.
 */
const allowedOrigins = new Set(
    (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:8080')
        .split(',')
        .map((originValue) => originValue.trim())
        .filter(Boolean)
);

/**
 * Install secure headers, strict CORS, body parsing and rate limiting.
 *
 * @param app - the express application to configure
 */
export const installSecurity = (app: Express): void => {
    // Strong rather than Express's default weak ETags: a weak comparison can answer 304 for content
    // that did change, serving stale data.
    app.set('etag', 'strong');

    /*
     * How many reverse proxies sit in front of this process — the COUNT, never `true`, so Express
     * counts back from the forgeable end of `X-Forwarded-For`. `0` means "use the socket address".
     *
     * See: docs/tools/security.md#trust-proxy-and-the-two-ways-to-get-it-wrong
     */
    const trustProxyHops = environmentNumber('NODE_TRUST_PROXY_HOPS', 0, 0);
    app.set('trust proxy', trustProxyHops);

    /*
     * BETTER_SECURITY.md 2.3: `0` is legitimate for the compose stack, which publishes the API
     * directly — so this warns rather than refusing to boot. But a production deployment behind a
     * reverse proxy with hops left at the default is either correct or catastrophic for the rate
     * limiter, and today that's silent either way.
     */
    if (trustProxyHops === 0 && process.env.NODE_ENV === 'production')
        logger.warn({
            message:
                'NODE_TRUST_PROXY_HOPS=0 in production. Correct only if this API is reached directly, with no reverse proxy in front of it — otherwise the rate limiter is bucketing every caller together.'
        });

    /**
     * Secure headers
     */
    app.use(helmet());

    /**
     * Strict CORS
     */
    app.use(
        cors({
            origin(origin, callback) {
                // Allow non-browser requests (no Origin header), like curl/healthchecks
                if (!origin) {
                    callback(null, true);
                    return;
                }
                if (allowedOrigins.has(origin)) {
                    callback(null, true);
                    return;
                }
                callback(new Error(`CORS blocked for origin: ${origin}`));
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'X-Requested-With',
                'x-request-id',
                'traceparent'
            ],
            exposedHeaders: ['x-request-id', 'traceparent']
        })
    );

    app.use(
        express.urlencoded({
            extended: true,
            limit: JSON_BODY_LIMIT
        })
    );

    app.use(express.json({ limit: JSON_BODY_LIMIT }));

    app.use(cookieParser());

    app.use(rateLimiter);
};
