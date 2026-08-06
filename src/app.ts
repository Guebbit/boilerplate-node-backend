#!/usr/bin/env node

// OTel must initialize before express/http/mongoose are imported.
import { startTracing } from '@core/bootstrap/otel-sdk';
startTracing();

import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import i18next from 'i18next';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { start } from '@core/bootstrap/database';
import { startCache, subscribeCacheInvalidation } from '@core/adapters/cache';
import { startQueue } from '@core/adapters/queue';
import { registerWorkers } from './workers';
import { logger, auditLogger } from '@core/adapters/logger';
import { rateLimiter } from '@middlewares/security';
import { requestLogger } from '@middlewares/request-logger';
import { attachObservability } from '@middlewares/observability';
import { rejectResponse } from '@core/http/response';
import { validateRequiredEnvironment } from '@core/bootstrap/environment';
import {
    getRouteLabel,
    recordRequestMetric,
    incrementInflight,
    decrementInflight
} from '@core/observability/metrics-http';
import { getActiveSpanContext, recordErrorOnActiveSpan } from '@core/observability/tracer';
import { shutdownInfra, registerSignalHandlers } from '@core/bootstrap/server-lifecycle';
import {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    t
} from '@core/i18n';
import { attachLocale } from '@middlewares/locale';

import { router as productRoutes } from './routes/products';
import { router as authRoutes } from './routes/account';
import { router as orderRoutes } from './routes/orders';
import { router as cartRoutes } from './routes/cart';
import { router as userRoutes } from './routes/users';
import { router as observabilityRoutes } from './routes/observability';
import { router as feedbackRoutes } from './routes/feedback';
import { router as localeRoutes } from './routes/locales';
import { router as systemRoutes } from './routes';

import { MulterError } from 'multer';
import { ExtendedError } from '@core/http/errors';

/**
 * Server start
 */
export const app = express();
const DEFAULT_PORT = 3000;
let activeServer: Server | undefined;
let shutdownPromise: Promise<void> | undefined;

/*
 * Parse port from env with fallback to default
 */
const getPort = () => {
    const parsedPort = Number.parseInt(process.env.NODE_PORT ?? String(DEFAULT_PORT), 10);
    return Number.isNaN(parsedPort) ? DEFAULT_PORT : parsedPort;
};

/*
 * Boot sequence: validate env → connect infra → mount i18n → listen
 */
export const startServer = () => {
    if (activeServer?.listening) return Promise.resolve(activeServer);

    return Promise.resolve()
        .then(() => validateRequiredEnvironment())
        .then(() => start())
        .then(() => startCache())
        .then(() => subscribeCacheInvalidation())
        .then(() => startQueue())
        .then(() => registerWorkers())
        .then(() =>
            // Every dictionary in src/locales is registered, so dropping in a file is the only
            // step needed to add a language — the middleware negotiates against the same list.
            i18next.init({
                lng: getDefaultLocale(),
                fallbackLng: getFallbackLocale(),
                supportedLngs: listSupportedLocales(),
                resources: loadLocaleResources()
            })
        )
        .then(
            () =>
                new Promise<Server>((resolve) => {
                    const port = getPort();
                    logger.info('------------- SERVER START -------------');
                    const server = app.listen(port, () => {
                        logger.info(`Server listening on port ${port}`);
                        activeServer = server;
                        resolve(server);
                    });
                })
        );
};

/*
 * Graceful shutdown wrapper — ensures single execution
 */
export const stopServer = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = shutdownInfra(activeServer).finally(() => {
        activeServer = undefined;
        shutdownPromise = undefined;
    });

    return shutdownPromise;
};

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
 * Allowed origins, separated by comma if multiple
 */
const allowedOrigins = new Set(
    (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:8080')
        .split(',')
        .map((originValue) => originValue.trim())
        .filter(Boolean)
);

/**
 * Strict CORS
 */
app.use(
    cors({
        origin(origin, callback) {
            // Allow non-browser requests (no Origin header), like curl/healthchecks
            // eslint-disable-next-line unicorn/no-null
            if (!origin) return callback(null, true);
            // eslint-disable-next-line unicorn/no-null
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

/*
 * Prometheus HTTP metrics — track latency and in-flight requests
 */
app.use((request, response, next) => {
    incrementInflight();
    const startTime = process.hrtime.bigint();
    response.once('finish', () => {
        decrementInflight();
        const elapsedTimeInMilliseconds = Number(process.hrtime.bigint() - startTime) / 1_000_000;
        recordRequestMetric({
            method: request.method,
            route: getRouteLabel(request),
            statusCode: response.statusCode,
            durationMs: elapsedTimeInMilliseconds
        });
    });
    next();
});

/**
 * REST API routes — domain-driven routing.
 */
app.use('/account', authRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/cart', cartRoutes);
app.use('/users', userRoutes);
app.use('/observability', observabilityRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/locales', localeRoutes);
app.use('/', systemRoutes);

/**
 * 404 handler — unmatched routes.
 */
app.use((request: Request, response: Response) => {
    rejectResponse(response, 404, 'Not Found');
});

/**
 * Global error handler — log once, stack in OTel span.
 *
 * Exported so it can be driven directly. Mounted last, after the 404 catch-all, which is what an
 * error handler has to be and also what makes it unreachable from a route registered afterwards
 * — so a test cannot get at it by adding a throwing route to `app`.
 */
export const handleUncaughtError = (
    error: Error,
    request: Request,
    response: Response,
    _next: NextFunction
) => {
    if (response.headersSent) return;

    recordErrorOnActiveSpan(error);

    const status =
        error instanceof MulterError ? 400 : error instanceof ExtendedError ? error.httpCode : 500;

    logger.error(`${error.name}: ${error.message}`, {
        request_id: request.requestId,
        trace_id: getActiveSpanContext().traceId,
        status
    });

    if (error instanceof MulterError)
        return rejectResponse(response, 400, error.message, [
            {
                code: error.code,
                message: error.message
            }
        ]);
    if (error instanceof ExtendedError)
        return rejectResponse(response, error.httpCode, error.name, error.errors);
    /*
     * The client is told that something failed, and nothing else.
     *
     * `errors[].message` used to be `error.message` — whatever threw. That is the one place an
     * unexpected error's own text reaches an unauthenticated caller, and unexpected is precisely
     * the case where nobody chose the wording: a Mongoose validation error naming internal field
     * paths, a driver error naming hosts and ports, an ENOENT naming a filesystem layout, a
     * third-party client quoting a URL with a key in it. Any of those is free reconnaissance,
     * and none of it means anything to the person reading it.
     *
     * The detail is not lost — it is logged above with the request id and trace id, which is
     * where an operator can act on it and a stranger cannot. `message` (3rd arg) stays the
     * developer-facing constant, per the `rejectResponse` docblock in `core/http/request.ts`.
     *
     * Deliberate errors are unaffected: `ExtendedError` carries copy its thrower chose and is
     * returned verbatim by the branch above.
     */
    rejectResponse(response, 500, 'Internal Server Error', [
        {
            code: 'INTERNAL_ERROR',
            message: t('generic.error-internal')
        }
    ]);
};

app.use(handleUncaughtError);

/*
 * Process-level error handlers — audit unhandled rejections/exceptions
 */
const unhandledRejections = new Map();
process
    .on('unhandledRejection', (reason, promise) => {
        auditLogger.error('process.unhandledRejection', {
            action: 'process.unhandledRejection',
            reason:
                reason instanceof Error
                    ? { name: reason.name, message: reason.message }
                    : String(reason)
        });
        unhandledRejections.set(promise, reason);
    })
    .on('rejectionHandled', (promise) => unhandledRejections.delete(promise))
    .on('uncaughtException', (error, origin) => {
        /*
         * In production, exit immediately to trigger orchestrator restart
         */
        if (process.env.NODE_ENV !== 'production') return;
        auditLogger.error('process.uncaughtException', {
            action: 'process.uncaughtException',
            name: error.name,
            message: error.message,
            origin
        });
        process.exit(1);
    });

/*
 * Auto-start in non-test environments
 */
if (process.env.NODE_ENV !== 'test') {
    registerSignalHandlers(stopServer);
    void startServer().catch((error: Error) =>
        logger.error('------------- SERVER ERROR -------------', error)
    );
}
