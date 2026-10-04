/**
 * @module
 * Transport-level protections and body parsing, grouped because the order matters and isn't
 * obvious: `trust proxy` before the rate limiter (which keys buckets on `request.ip`), the rate
 * limiter before the body parsers (a throttled flood should not pay for parsing), body parsers
 * before anything reading `request.body`. Two installs, so `src/app.ts` can serve static files
 * between them. Infrastructure supplies the handlers; this decides which ones this application
 * installs, and in what order.
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
import { requireDeclaredContentType } from '@infrastructure/http/middlewares/content-type';
import { limitJsonDepth } from '@infrastructure/http/middlewares/json-depth';
import { REQUEST_CONTENT_TYPES } from '@api/request-content-types';
import { siteConfig } from '@infrastructure/http/config';
import { appConfig } from './config';
import { enabledModules } from '../modules';

/**
 * `express.json()`/`express.urlencoded()`'s own default (`100kb`) is already a bound, but an
 * implicit one nobody reading this file would find. Explicit and
 * configurable, same shape as `NODE_MAX_UPLOAD_BYTES` for multipart bodies.
 */
const JSON_BODY_LIMIT = appConfig().NODE_JSON_BODY_LIMIT;

/**
 * Every path whose body must survive parsing verbatim, composed from each module's own declaration.
 *
 * Built once at import: the list is fixed by the module registry, and rebuilding it per request
 * would cost a map and a flat on every JSON body the API receives.
 */
const RAW_BODY_PATHS = enabledModules.flatMap((appModule) =>
    (appModule.rawBodyPaths ?? []).map((path) => `${appModule.basePath ?? ''}${path}`)
);

/**
 * Whether this url is one of them — matched at a segment boundary, never as a bare prefix, so
 * `/payments/webhook-test` is not mistaken for `/payments/webhook`.
 */
const isRawBodyPath = (url: string): boolean =>
    RAW_BODY_PATHS.some(
        (path) => url === path || url.startsWith(`${path}?`) || url.startsWith(`${path}/`)
    );

/**
 * Origins allowed to call this API with credentials, from `NODE_CORS_ORIGIN`.
 *
 * Separated by comma if multiple; blank entries are dropped so a trailing comma cannot add an
 * empty origin to the set.
 */
const allowedOrigins = new Set(
    siteConfig().NODE_CORS_ORIGIN.length > 0
        ? siteConfig().NODE_CORS_ORIGIN
        : ['http://localhost:8080']
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
    server.headersTimeout = appConfig().NODE_HTTP_HEADERS_TIMEOUT_MS;

    /*
     * The whole request, headers and body. Generous rather than tight because it is also the
     * ceiling on a legitimate upload: `NODE_MAX_UPLOAD_BYTES` (5 MB) over a poor mobile link needs
     * most of this, and the endpoint answering 408 mid-upload is worse than the connection cost.
     */
    server.requestTimeout = appConfig().NODE_HTTP_REQUEST_TIMEOUT_MS;

    /*
     * Node's own 5s default, exposed rather than changed. RAISE it above the idle timeout of
     * whatever proxy terminates TLS: if the proxy holds a socket this server has already closed,
     * it sends the next request into a dead connection and answers 502 to a caller who did
     * nothing wrong.
     *
     * See: docs/tools/security.md
     */
    server.keepAliveTimeout = appConfig().NODE_HTTP_KEEP_ALIVE_TIMEOUT_MS;
};

/**
 * Install secure headers and strict CORS — everything a static file needs too.
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
     * `false`, not `0`, for no proxy: express-rate-limit tells "trust proxy is off" from a number
     * by `=== false`, and only then does it notice an `X-Forwarded-For` arriving from a proxy this
     * deployment forgot to count — the one misconfiguration worth a warning, logged through the app
     * logger (see `buildRateLimiter`). Express reads both the same way.
     *
     * See: docs/tools/security.md#trust-proxy-and-the-two-ways-to-get-it-wrong
     */
    const trustProxyHops = appConfig().NODE_TRUST_PROXY_HOPS;
    app.set('trust proxy', trustProxyHops === 0 ? false : trustProxyHops);

    /**
     * Secure headers
     */
    app.use(helmet());

    /*
     * `Vary: Origin` on EVERY response. `cors` adds it only when it reflects an allowed origin, so
     * a refused origin's answer (no CORS headers) could be stored by a shared cache under the same
     * key as the real frontend's, which would then be served the header-less variant and fail
     * CORS in the browser. `GET /products/categories` is publicly cached, so this is reachable.
     * Express merges it with the one `cors` adds, never doubling it.
     * https://expressjs.com/en/api.html#res.vary
     */
    app.use((_request, response, next) => {
        response.vary('Origin');
        next();
    });

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
                /*
                 * `false`, never an `Error`. Handing `cors` an error marks the REQUEST as failed:
                 * it throws into the express error chain and a valid call answers a generic 500
                 * before its route ever runs. `false` omits `Access-Control-Allow-Origin` and
                 * continues, which is the whole mechanism — the browser's same-origin policy is
                 * what refuses the response to the calling page, and a server-to-server caller
                 * with no origin to enforce is unaffected either way.
                 */
                callback(null, false);
            },
            credentials: true,
            methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
            allowedHeaders: [
                'Content-Type',
                'Authorization',
                'X-Requested-With',
                'x-request-id',
                'traceparent',
                // Declared by the contract on the retry-safe writes; a browser sending it would
                // otherwise fail the preflight.
                'Idempotency-Key',
                // Declared by the contract on PUT/PATCH/DELETE of a versioned row — see
                // `src/infrastructure/http/preconditions.ts`.
                'If-Match',
                // Read by humanChallengeGate (human-challenge.ts) once a provider is active.
                'x-antibot-challenge-token',
                // Read by callerContextOf (infrastructure/http/request.ts) for every request's
                // analytics-consent flag.
                'x-analytics-consent'
            ],
            // What a browser client may read off a response: the rate-limit answer (draft-7
            // headers, see `rate-limit.ts`) is what lets it back off instead of retrying blind.
            exposedHeaders: [
                'x-request-id',
                'traceparent',
                'Retry-After',
                'RateLimit',
                'RateLimit-Policy',
                // The version an edit form sends back as `If-Match`.
                'ETag'
            ]
        })
    );
};

/**
 * Install rate limiting, then body parsing. Mounted after static files, so an image a page loads
 * does not spend the caller's request budget.
 *
 * @param app - the express application to configure
 */
export const installRequestParsing = (app: Express): void => {
    // First: a request past its budget is refused before its body is read.
    app.use(rateLimiter);

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
            // RFC 7396's own media type: a PATCH may send `application/merge-patch+json`, which is
            // the same JSON with the merge meaning the contract already gives every PATCH.
            type: ['application/json', 'application/merge-patch+json'],
            verify: (request, _response, buffer) => {
                // One cast, with a reason: `express.json` types its `verify` hook against the bare
                // `http.IncomingMessage` the parser sees. It is the same object express has
                // already decorated — `rawBody` is declared on it in `globals.d.ts`.
                const decorated = request as Request;
                if (isRawBodyPath(decorated.url)) decorated.rawBody = Buffer.from(buffer);
            }
        })
    );

    // Right after the parser: a body nested past the depth limit is refused before any walker
    // (fingerprint, cache key, schema) can overflow the stack on it.
    app.use(limitJsonDepth);

    // cookie-parser: fills `request.cookies` from the `Cookie` header (no secret: nothing is signed).
    // https://github.com/expressjs/cookie-parser#readme
    app.use(cookieParser());

    // After the parsers, before any route: a body no parser understood is refused, not read as `{}`.
    app.use(requireDeclaredContentType(REQUEST_CONTENT_TYPES));
};
