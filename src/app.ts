#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import type { Server } from 'node:http';
import crypto from 'node:crypto';
import i18next from 'i18next';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { start } from '@utils/database';
import { startCache } from '@utils/cache';
import { logger } from '@utils/winston';
import { rateLimiter } from '@middlewares/security';
import { rejectResponse } from '@utils/response';
import { validateRequiredEnvironment } from '@utils/environment';
import enTranslation from './locales/en.json';

import { router as productRoutes } from './routes/products';
import { router as authRoutes } from './routes/account';
import { router as orderRoutes } from './routes/orders';
import { router as cartRoutes } from './routes/cart';
import { router as userRoutes } from './routes/users';
import { router as systemRoutes } from './routes';

import { MulterError } from 'multer';
import { ExtendedError } from '@utils/helpers-errors';

/**
 * Server start
 */
export const app = express();

const getPort = () => {
    const parsedPort = Number.parseInt(process.env.NODE_PORT ?? '3000', 10);
    return Number.isNaN(parsedPort) ? 3000 : parsedPort;
};

/**
 * Disable weak ETag generation (which is the default in Express) to ensure proper caching behavior.
 * With weak ETags, the server may return a 304 Not Modified response even if the content has changed,
 * which can lead to stale data being served.
 * By using strong ETags, we ensure that clients receive updated content when it changes.
 */
app.set('etag', 'strong');

/**
 * Sync dependencies then start HTTP server.
 * Exported to make integration tests start/stop the app without side effects on import.
 */
export const startServer = () =>
    Promise.resolve()
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
                        resolve(server);
                    });
                })
        );

/**
 * Secure headers
 */
app.use(helmet());

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
 * Triggered every time a piece of the request body arrives:
 * logs incoming data pieces
 */
// app.use((req, res, next) => {
//     req.on("data", (chunk) => {
//         console.log("------------- REQUEST CHUNK DATA -------------", chunk)
//     });
//     req.on("end", () => {
//         console.log("------------- REQUEST END -------------")
//         // res.statusCode = 200;
//         // res.setHeader("Location", "/");
//         // res.end();
//         next();
//     });
// });

/**
 * Parse cookies (needed for the JWT refresh token cookie)
 */
app.use(cookieParser());

/**
 * Security: rate limit all requests before any DB access
 */
app.use(rateLimiter);

/**
 * Request ID correlation.
 * requestId is a per-request unique identifier used to trace one HTTP call across logs,
 * middleware, controllers, and error handlers.
 * If a client already sends x-request-id we reuse it, otherwise we generate a new one.
 * The same ID is returned in the response header so frontend and backend can correlate issues.
 */
app.use((request, response, next) => {
    const requestId = request.get('x-request-id') ?? crypto.randomUUID();
    request.requestId = requestId;
    response.setHeader('x-request-id', requestId);
    next();
});

/**
 * Request logger
 */
app.use((request, _response, next) => {
    logger.info({
        requestId: request.requestId,
        method: request.method,
        url: `${request.protocol}://${request.get('host')}${request.originalUrl}`
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

    // Multer file-upload errors
    if (error instanceof MulterError) {
        logger.error({
            requestId: request.requestId,
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
        message: error.message,
        stack: error.stack,
        name: error.name
    });

    rejectResponse(response, 500, 'Internal Server Error', [error.message]);
});

/**
 * Error handling LAST RESORT
 */
const unhandledRejections = new Map();
process
    .on('unhandledRejection', (reason, promise) => {
        logger.error(reason);
        unhandledRejections.set(promise, reason);
    })
    .on('rejectionHandled', (promise) => unhandledRejections.delete(promise))
    .on('uncaughtException', (error, origin) => {
        if (process.env.NODE_ENV !== 'production') return;
        logger.error({
            message: error.message,
            stack: error.stack,
            name: error.name,
            origin
        });
        process.exit(1);
    });

if (process.env.NODE_ENV !== 'test') {
    void startServer().catch((error: Error) => logger.info('------------- SERVER ERROR -------------', error));
}
