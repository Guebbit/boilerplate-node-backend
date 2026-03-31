#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import i18next from 'i18next';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { start } from '@utils/database';
import logger from '@utils/winston';
import { rateLimiter } from '@middlewares/security';
import { rejectResponse } from '@utils/response';
import enTranslation from './locales/en.json';

import productRoutes from './routes/products';
import authRoutes from './routes/auth';
import orderRoutes from './routes/orders';
import cartRoutes from './routes/cart';
import userRoutes from './routes/users';
import systemRoutes from './routes';
import { MulterError } from 'multer';
import { ExtendedError } from '@utils/helpers-errors';

/**
 * Server start
 */
const app = express();

/**
 * Sync database then start server
 * AFTER sync we can use the database, since it is initialized
 */
start()
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
    .then(() => {
        logger.info('------------- SERVER START -------------');
        app.listen(process.env.NODE_PORT ?? 3000);
    })
    .catch((error) => logger.info('------------- SERVER ERROR -------------', error));

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
 * Request logger
 */
app.use((request, _response, next) => {
    logger.info(`Entering URL: ${request.protocol}://${request.get('host')}${request.originalUrl}`);
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
app.use((_request: Request, response: Response) => {
    rejectResponse(response, 404, 'Not Found');
});

/**
 * Global JSON error handler
 */
app.use((error: Error, _request: Request, response: Response, _next: NextFunction) => {
    if (response.headersSent) return;

    // Multer file-upload errors
    if (error instanceof MulterError) {
        logger.error({
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
