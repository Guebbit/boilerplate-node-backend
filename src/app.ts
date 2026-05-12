#!/usr/bin/env node

// ─── Phase 3: OTel must start before any other imports ───────────────────────
// Importing tracing.ts here ensures the SDK is initialized (and Express/HTTP
// instrumentation patches applied) before express or mongoose are loaded.
import { startTracing, shutdownTracing } from '@utils/tracing';
import { shutdownAnalytics } from '@utils/analytics';
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
import { start, stopDatabase } from '@utils/database';
import { startCache, stopCache } from '@utils/cache';
import { logger, auditLogger } from '@utils/winston';
import { rateLimiter } from '@middlewares/security';
import { requestLogger } from '@middlewares/request-logger';
import { rejectResponse } from '@utils/response';
import { validateRequiredEnvironment } from '@utils/environment';
import {
    createTraceContext,
    getRouteLabel,
    recordRequestMetric,
    toTraceparentHeader,
    incrementInflight,
    decrementInflight
} from '@utils/observability';
import { getActiveSpanContext, recordErrorOnActiveSpan } from '@utils/tracer';
import enTranslation from './locales/en.json';

import { router as productRoutes } from './routes/products';
import { router as authRoutes } from './routes/account';
import { router as orderRoutes } from './routes/orders';
import { router as cartRoutes } from './routes/cart';
import { router as userRoutes } from './routes/users';
import { router as adminRoutes } from './routes/admin';
import { router as feedbackRoutes } from './routes/feedback';
import { router as systemRoutes } from './routes';

import { MulterError } from 'multer';
import { ExtendedError } from '@utils/helpers-errors';

/**
 * Server start
 */
export const app = express();
const DEFAULT_PORT = 3000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;
let activeServer: Server | undefined;
let shutdownPromise: Promise<void> | undefined;

/**
 * Treat port configuration as untrusted input and fall back to a safe default.
 */
const getPort = () => {
    const parsedPort = Number.parseInt(process.env.NODE_PORT ?? String(DEFAULT_PORT), 10);
    return Number.isNaN(parsedPort) ? DEFAULT_PORT : parsedPort;
};

/**
 * Graceful shutdown needs a hard upper bound so a stuck dependency cannot hang the process forever.
 */
const getShutdownTimeoutMs = () => {
    const parsedTimeout = Number.parseInt(
        process.env.NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? String(DEFAULT_SHUTDOWN_TIMEOUT_MS),
        10
    );
    return Number.isNaN(parsedTimeout) ? DEFAULT_SHUTDOWN_TIMEOUT_MS : parsedTimeout;
};

/**
 * Promisify server.close so HTTP teardown composes with the rest of the async shutdown flow.
 */
const closeServer = (server: Server) =>
    new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) return reject(error);
            resolve();
        });
    });

/**
 * Route every process signal through one shutdown path to keep teardown semantics consistent.
 */
const onProcessSignal = (signal: NodeJS.Signals) => {
    logger.info(`Received ${signal}, starting graceful shutdown.`);
    const forcedExitTimer = setTimeout(() => {
        logger.error('Graceful shutdown timeout reached. Forcing process exit.');
        process.exit(1);
    }, getShutdownTimeoutMs());
    forcedExitTimer.unref();

    void Promise.resolve()
        .then(() => stopServer())
        .then(() => {
            logger.info('Graceful shutdown completed.');
            process.exit(0);
        })
        .catch((error: unknown) => {
            logger.error({
                message: 'Graceful shutdown failed.',
                error: error instanceof Error ? error.message : String(error)
            });
            process.exit(1);
        });
};

/**
 * Sync dependencies then start HTTP server.
 * Exported to make integration tests start/stop the app without side effects on import.
 */
export const startServer = () => {
    if (activeServer?.listening) return Promise.resolve(activeServer);

    return Promise.resolve()
        .then(() => validateRequiredEnvironment())
        .then(() => start())
        .then(() => startCache())
        .then(() =>
            i18next.init({
                lng: process.env.NODE_DEFAULT_LOCALE ?? 'en',
                fallbackLng: process.env.NODE_FALLBACK_LOCALE ?? 'en',
                resources: {
                    en: {
                        translation: enTranslation as Record<string, unknown>
                    }
                }
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

/**
 * Memoize shutdown so concurrent callers do not race while closing the same resources.
 */
export const stopServer = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = Promise.resolve(activeServer)
        .then((server) => {
            if (!server?.listening) return;
            return closeServer(server);
        })
        .then(() => stopCache())
        .then(() => stopDatabase())
        .then(() => shutdownAnalytics()) // flush PostHog events before exit
        .then(() => shutdownTracing()) // flush OTel spans before exit
        .finally(() => {
            activeServer = undefined;
            shutdownPromise = undefined;
        });

    return shutdownPromise;
};

/**
 * Tests control process lifecycle explicitly, so signal hooks stay disabled there.
 */
const registerSignalHandlers = () => {
    if (process.env.NODE_ENV === 'test') return;
    process.on('SIGTERM', () => onProcessSignal('SIGTERM'));
    process.on('SIGINT', () => onProcessSignal('SIGINT'));
};

/**
 * Disable weak ETag generation (which is the default in Express) to ensure proper caching behavior.
 * With weak ETags, the server may return a 304 Not Modified response even if the content has changed,
 * which can lead to stale data being served.
 * By using strong ETags, we ensure that clients receive updated content when it changes.
 */
app.set('etag', 'strong');

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
            // Allowed origins
            // eslint-disable-next-line unicorn/no-null
            if (allowedOrigins.has(origin)) return callback(null, true);
            // Not allowed
            return callback(new Error(`CORS blocked for origin: ${origin}`));
        },

        /**
         * Enables sending credentials in cross-origin requests.
         * "Credentials" = cookies, Authorization headers, TLS client certs.
         *     *
         * Client must also explicitly opt-in:
         * fetch(..., { credentials: 'include' })
         * axios(..., { withCredentials: true })
         *
         * If you don't use cookies/auth across origins → set this to false
         */
        credentials: true,

        /**
         * Allowed HTTP methods for CORS (sent in Access-Control-Allow-Methods).
         * If a method isn’t listed → browser blocks the request
         */
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],

        /**
         * Request headers the client is allowed to send (preflight check).
         * Missing header here → preflight fails
         */
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Requested-With',
            'x-request-id',
            'traceparent'
        ],

        /**
         * Response headers the browser is allowed to read in JS.
         * Without this → headers exist but are not accessible
         */
        exposedHeaders: ['x-request-id', 'traceparent', 'x-trace-id']
    })
);

/**
 * Parses URL-encoded data (from HTML forms)
 * Extended: true allows nested objects using the qs library
 */
app.use(
    express.urlencoded({
        extended: true
    })
);

/**
 * Parses JSON request bodies
 */
app.use(express.json());

/**
 * Parse cookies (needed for the JWT refresh token cookie)
 */
app.use(cookieParser());

/**
 * Security: rate limit all requests before any DB access
 */
app.use(rateLimiter);

/** Attach or reuse x-request-id for request correlation. */
app.use((request, response, next) => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
});

/** Attach trace context and propagate trace headers. */
app.use((request, response, next) => {
    // Prefer OTel span IDs when the SDK has an active span for this request
    // (set by HttpInstrumentation). Fall back to manual W3C parsing otherwise.
    const otel = getActiveSpanContext();
    const traceContext =
        otel.traceId && otel.spanId
            ? { traceId: otel.traceId, spanId: otel.spanId }
            : createTraceContext(request.get('traceparent'));

    request.traceContext = traceContext;
    response.setHeader('traceparent', toTraceparentHeader(traceContext));
    response.setHeader('x-trace-id', traceContext.traceId);
    next();
});

/** Emit one structured access log per completed request. */
app.use(requestLogger);

/**
 * Request metrics collector (Prometheus style):
 * - total requests by method/route/status
 * - request duration histogram
 * - in-flight gauge
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
 * REST API routes
 */
app.use('/account', authRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);
app.use('/cart', cartRoutes);
app.use('/users', userRoutes);
app.use('/admin', adminRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/', systemRoutes);

/**
 * 404 handler — catch all unmatched routes
 */
app.use((request: Request, response: Response) => {
    rejectResponse(response, 404, 'Not Found');
});

/**
 * Global JSON error handler
 */
app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
    if (response.headersSent) return;

    // Record the error on the active OTel span so it surfaces in traces.
    recordErrorOnActiveSpan(error);

    // Multer file-upload errors
    if (error instanceof MulterError) {
        logger.error({
            requestId: request.requestId,
            traceId: request.traceContext?.traceId,
            spanId: request.traceContext?.spanId,
            message: error.message,
            code: error.code,
            field: error.field
        });
        return rejectResponse(response, 400, error.message, [error.code]);
    }

    // Operational errors with a known HTTP status code
    if (error instanceof ExtendedError)
        return rejectResponse(response, error.httpCode, error.name, error.errors);

    logger.error({
        requestId: request.requestId,
        traceId: request.traceContext?.traceId,
        spanId: request.traceContext?.spanId,
        message: error.message,
        stack: error.stack,
        name: error.name
    });

    rejectResponse(response, 500, 'Internal Server Error', [error.message]);
});

/** Last-resort process error handlers (audit stream). */
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
        if (process.env.NODE_ENV !== 'production') return;
        auditLogger.error('process.uncaughtException', {
            action: 'process.uncaughtException',
            name: error.name,
            message: error.message,
            stack: error.stack,
            origin
        });
        process.exit(1);
    });

if (process.env.NODE_ENV !== 'test') {
    registerSignalHandlers();
    void startServer().catch((error: Error) =>
        logger.error('------------- SERVER ERROR -------------', error)
    );
}
