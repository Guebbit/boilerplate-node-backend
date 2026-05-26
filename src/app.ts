#!/usr/bin/env node

// OTel must initialize before express/http/mongoose are imported.
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
import { startQueue, stopQueue } from '@utils/queue';
import { registerWorkers } from './workers';
import { logger, auditLogger } from '@utils/winston';
import { rateLimiter } from '@middlewares/security';
import { requestLogger } from '@middlewares/request-logger';
import { rejectResponse } from '@utils/response';
import { validateRequiredEnvironment } from '@utils/environment';
import {
    getRouteLabel,
    recordRequestMetric,
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
import { handleWebSocketUpgrade } from './routes/websocket';

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

const getPort = () => {
    const parsedPort = Number.parseInt(process.env.NODE_PORT ?? String(DEFAULT_PORT), 10);
    return Number.isNaN(parsedPort) ? DEFAULT_PORT : parsedPort;
};

const getShutdownTimeoutMs = () => {
    const parsedTimeout = Number.parseInt(
        process.env.NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? String(DEFAULT_SHUTDOWN_TIMEOUT_MS),
        10
    );
    return Number.isNaN(parsedTimeout) ? DEFAULT_SHUTDOWN_TIMEOUT_MS : parsedTimeout;
};

const closeServer = (server: Server) =>
    new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) return reject(error);
            resolve();
        });
    });

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

export const startServer = () => {
    if (activeServer?.listening) return Promise.resolve(activeServer);

    return Promise.resolve()
        .then(() => validateRequiredEnvironment())
        .then(() => start())
        .then(() => startCache())
        .then(() => startQueue())
        .then(() => registerWorkers())
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
                    server.on('upgrade', (request, socket, head) =>
                        handleWebSocketUpgrade(request, socket, head)
                    );
                })
        );
};

export const stopServer = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = Promise.resolve(activeServer)
        .then((server) => {
            if (!server?.listening) return;
            return closeServer(server);
        })
        .then(() => stopCache())
        .then(() => stopQueue())
        .then(() => stopDatabase())
        .then(() => shutdownAnalytics())
        .then(() => shutdownTracing())
        .finally(() => {
            activeServer = undefined;
            shutdownPromise = undefined;
        });

    return shutdownPromise;
};

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

/** Attach or reuse x-request-id for client/server log correlation. */
app.use((request, response, next) => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
});

/** Slim access log + Prometheus HTTP metrics. */
app.use(requestLogger);

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
 * Global JSON error handler. One log line per error; the stack lives on the OTel span.
 */
app.use((error: Error, request: Request, response: Response, _next: NextFunction) => {
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
        return rejectResponse(response, 400, error.message, [error.code]);
    if (error instanceof ExtendedError)
        return rejectResponse(response, error.httpCode, error.name, error.errors);
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
