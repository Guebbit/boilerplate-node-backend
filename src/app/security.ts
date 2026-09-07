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
import type { Express, Request } from 'express';
import type { Server } from 'node:http';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { rateLimiter } from '@infrastructure/http/middlewares/rate-limit';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { logger } from '@infrastructure/adapters/logger';

/**
 * `express.json()`/`express.urlencoded()`'s own default (`100kb`) is already a bound, but an
 * implicit one nobody reading this file would find. Explicit and
 * configurable, same shape as `NODE_MAX_UPLOAD_BYTES` for multipart bodies.
 */
const JSON_BODY_LIMIT = process.env.NODE_JSON_BODY_LIMIT ?? '100kb';

/**
 * The paths whose callers SIGN their request body, and which therefore need it kept verbatim.
 *
 * Listed here rather than in the module that reads it because the body is consumed once, by the
 * parser installed below — a module's own router runs long after the stream is gone. Every entry
 * costs one buffer copy per matching request, so this list stays short.
 */
const RAW_BODY_PATHS = ['/payments/webhook'];

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
 * Bound how long a client may take to SEND a request, which Node's own defaults barely do.
 *
 * Slowloris and slow-POST are not floods: one client trickles bytes and holds a connection, and a
 * few hundred such connections exhaust the pool while the rate limiter — which counts REQUESTS —
 * sees almost nothing. Node ships 60s for headers and 300s for a whole request, so the process
 * would hold a half-sent request for five minutes by default.
 *
 * Both bound RECEIVING only, never the handler: a slow invoice render is unaffected by
 * `requestTimeout`, which is what makes tightening it safe.
 *
 * @param server - the listening server returned by `app.listen`
 */
export const applyServerTimeouts = (server: Server): void => {
    /*
     * Headers are small and arrive at once, so anything past a few seconds is a client trickling
     * them. Measured from the request's FIRST BYTE, not from when the socket opened, so this may
     * safely sit below `keepAliveTimeout` — an idle keep-alive socket is not affected.
     */
    server.headersTimeout = environmentNumber('NODE_HTTP_HEADERS_TIMEOUT_MS', 15_000, 1);

    /*
     * The whole request, headers and body. Generous rather than tight because it is also the
     * ceiling on a legitimate upload: `NODE_MAX_UPLOAD_BYTES` (5 MB) over a poor mobile link needs
     * most of this, and the endpoint answering 408 mid-upload is worse than the connection cost.
     */
    server.requestTimeout = environmentNumber('NODE_HTTP_REQUEST_TIMEOUT_MS', 120_000, 1);

    /*
     * Node's own 5s default, exposed rather than changed. RAISE it above the idle timeout of
     * whatever proxy terminates TLS: if the proxy holds a socket this server has already closed,
     * it sends the next request into a dead connection and answers 502 to a caller who did
     * nothing wrong.
     *
     * See: docs/tools/security.md
     */
    server.keepAliveTimeout = environmentNumber('NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS', 5000, 1);
};

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
     * `0` is legitimate for the compose stack, which publishes the API
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

    /*
     * The JSON parser, plus the one exception every webhook-receiving application needs.
     *
     * A signed callback is authenticated by an HMAC over the EXACT bytes the sender transmitted,
     * and `JSON.stringify(request.body)` is not those bytes — key order, number formatting and
     * whitespace all move. `verify` runs with the buffer still intact, so the route that needs it
     * gets it; every other route does not, which is why this is a prefix test rather than an
     * unconditional copy of every body the API receives.
     */
    app.use(
        express.json({
            limit: JSON_BODY_LIMIT,
            verify: (request, _response, buffer) => {
                if (RAW_BODY_PATHS.some((prefix) => (request as Request).url.startsWith(prefix)))
                    (request as Request).rawBody = Buffer.from(buffer);
            }
        })
    );

    app.use(cookieParser());

    app.use(rateLimiter);
};
