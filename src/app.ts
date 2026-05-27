#!/usr/bin/env node

/** OTel must initialize before express/http/mongoose are imported. */
import { startTracing } from '@utils/tracing';
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
import { start } from '@utils/database';
import { startCache } from '@utils/cache';
import { startQueue } from '@utils/queue';
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
import { shutdownInfra, registerSignalHandlers } from '@utils/server-lifecycle';
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
 * Main Express application — infrastructure setup, middleware stack, route mounting.
 */
export const app = express();
const DEFAULT_PORT = 3000;
let activeServer: Server | undefined;
let shutdownPromise: Promise<void> | undefined;

/** Parse port from env with fallback to default. */
const getPort = () => {
    const parsedPort = Number.parseInt(process.env.NODE_PORT ?? String(DEFAULT_PORT), 10);
    return Number.isNaN(parsedPort) ? DEFAULT_PORT : parsedPort;
};

/** Boot sequence: validate env → connect infra → mount i18n → listen. */
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

/** Graceful shutdown wrapper — ensures single execution. */
export const stopServer = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = shutdownInfra(activeServer).finally(() => {
        activeServer = undefined;
        shutdownPromise = undefined;
    });

    return shutdownPromise;
};

/**
 * Strong ETags ensure clients receive updates when content changes.
 * Weak ETags (Express default) can serve stale data with 304 responses.
 */
app.set('etag', 'strong');

/** Apply helmet for security headers (CSP, HSTS, etc). */
app.use(helmet());

/** Parse comma-separated allowed origins from env. */
const allowedOrigins = new Set(
    (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:8080')
        .split(',')
        .map((originValue) => originValue.trim())
        .filter(Boolean)
);

/** CORS: whitelist origins, allow credentials, expose trace headers. */
app.use(
    cors({
        origin(origin, callback) {
            /** Allow non-browser requests (no Origin header), like curl/healthchecks. */
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

/** Parse URL-encoded and JSON bodies. */
app.use(
    express.urlencoded({
        extended: true
    })
);

app.use(express.json());

/** Parse cookies for JWT refresh token. */
app.use(cookieParser());

/** Rate limiting to prevent abuse. */
app.use(rateLimiter);

/** Request ID middleware — reuse client ID or generate new UUID. */
app.use((request, response, next) => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
});

/** Winston access log + OpenTelemetry trace injection. */
app.use(requestLogger);

/** Prometheus HTTP metrics — track latency and in-flight requests. */
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
app.use('/admin', adminRoutes);
app.use('/feedback', feedbackRoutes);
app.use('/', systemRoutes);

/**
 * 404 handler — unmatched routes.
 */
app.use((request: Request, response: Response) => {
    rejectResponse(response, 404, 'Not Found');
});

/**
 * Global error handler — log once, stack in OTel span.
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

/** Process-level error handlers — audit unhandled rejections/exceptions. */
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
        /** In production, exit immediately to trigger orchestrator restart. */
        if (process.env.NODE_ENV !== 'production') return;
        auditLogger.error('process.uncaughtException', {
            action: 'process.uncaughtException',
            name: error.name,
            message: error.message,
            origin
        });
        process.exit(1);
    });

/** Auto-start in non-test environments. */
if (process.env.NODE_ENV !== 'test') {
    registerSignalHandlers(stopServer);
    void startServer().catch((error: Error) =>
        logger.error('------------- SERVER ERROR -------------', error)
    );
}
