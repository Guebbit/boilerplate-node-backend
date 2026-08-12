/**
 * Transport-level protections and body parsing.
 *
 * Grouped because the order inside matters and is not obvious: `trust proxy` must be set before
 * the rate limiter, which keys its buckets on `request.ip`, and the body parsers must precede
 * everything that reads `request.body`.
 *
 * The limiter itself is substrate and lives in `@infrastructure/http/middlewares/security`; what stays here
 * is the decision of which protections THIS application installs and in what order. That is an
 * assembly fact, so it belongs to `app` — infrastructure supplies the handlers, app arranges them.
 */

import express from 'express';
import type { Express } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimiter } from '@infrastructure/http/middlewares/security';

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
    /**
     * Disable weak ETag generation (which is the default in Express) to ensure proper caching behavior.
     * With weak ETags, the server may return a 304 Not Modified response even if the content has changed,
     * which can lead to stale data being served.
     * By using strong ETags, we ensure that clients receive updated content when it changes.
     */
    app.set('etag', 'strong');

    /**
     * How many reverse proxies sit in front of this process.
     *
     * Everything that identifies a caller by address — the rate limiter's bucket key, the audit
     * log's `ip` — reads `request.ip`, and behind a proxy that is the PROXY's address unless Express
     * is told otherwise. Both failure modes are bad and neither is visible:
     *
     * - **Unset (Express's default) behind a proxy**: every request looks like one client, so the
     *   per-IP limiter becomes one shared bucket. It stops protecting anything, and a single busy
     *   caller 429s everyone else. The audit log records the proxy for every actor.
     * - **`true` (trust everything)**: `X-Forwarded-For` is client-supplied, so a caller sets it to a
     *   random value per request and never hits the limit at all. `true` is strictly worse than
     *   unset for anything security-related, which is why it is not the default here.
     *
     * The correct value is the NUMBER of proxies you actually run, so Express counts back from the
     * right-hand end of `X-Forwarded-For` — the part a client cannot forge. `0` (the default here)
     * means "no proxy, use the socket address", which is right for local development and for the
     * compose stack, where the API is published directly.
     */
    app.set('trust proxy', Number.parseInt(process.env.NODE_TRUST_PROXY_HOPS ?? '0', 10) || 0);

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
                if (!origin) return callback(null, true);
                if (allowedOrigins.has(origin)) return callback(null, true);
                return callback(new Error(`CORS blocked for origin: ${origin}`));
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
            extended: true
        })
    );

    app.use(express.json());

    app.use(cookieParser());

    app.use(rateLimiter);
};
