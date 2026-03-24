#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import type { ErrorRequestHandler, Request, Response, NextFunction } from "express";
import i18next from 'i18next';
import helmet from "helmet";
import bodyParser from 'body-parser';
import { ExtendedError } from "@utils/error-helpers";
import { start } from "@utils/database";
import logger from "@utils/winston";
import { rateLimiter } from "./middlewares/security";
// languages
import enTranslation from './locales/en.json';
// routes
import productRoutes from "./routes/products";
import authRoutes from "./routes/auth";
import orderRoutes from "./routes/orders";
import cartRoutes from "./routes/cart";
import userRoutes from "./routes/users";
import systemRoutes from "./routes";


/**
 * Server start
 */
const app = express();

/**
 * Sync database then start server
 * AFTER sync we can use the database, since it is initialized
 */
start()
    .then(() => i18next.init({
        // debug: true,
        lng: process.env.NODE_DEFAULT_LOCALE ?? 'en',
        fallbackLng: process.env.NODE_FALLBACK_LOCALE ?? 'en',
        resources: {
            en: {
                translation: enTranslation as Record<string, unknown>,
            }
        }
    }))
    .then(() => {
        logger.info("------------- SERVER START -------------");
        app.listen(process.env.NODE_PORT ?? 3000);
    })
    .catch(error => logger.info("------------- SERVER ERROR -------------", error));

/**
 * Secure headers
 */
app.use(helmet());

/**
 * Parse JSON request bodies
 */
app.use(bodyParser.json());

/**
 * Security
 * Limit user to access multiple times and overload the server.
 * Placed before route handlers so the rate limiter fires before any DB access.
 */
app.use(rateLimiter);

/**
 * Generic middleware
 *
 * next() required to proceed in the chain,
 * otherwise response will be sent and connection with client closed
 */
app.use((request, response, next) => {
    logger.info(`Entering URL: ${ request.protocol }://${ request.get('host') }${ request.originalUrl }`);
    next();
});

app.use('/products', productRoutes);
app.use('/account', authRoutes);
app.use('/orders', orderRoutes);
app.use('/users', userRoutes);
app.use('/cart', cartRoutes);
app.use('/', systemRoutes);

/**
 * Error handler.
 * Distinguish operational error from critical programmer error.
 * All responses are JSON for a REST API.
 * Operational error: return JSON error response with appropriate HTTP code.
 * Critical errors: Error documented for later study, then current worker is suppressed so a new one is born (from cluster management).
 */
app.use((error: ErrorRequestHandler | ExtendedError, request: Request, response: Response, next: NextFunction) => {
    // If headers already has been sent (shouldn't happen) delegate to the default Express error handler
    if (response.headersSent) {
        next(error);
        return;
    }

    // Check if the error is operational
    if (error instanceof ExtendedError && error.isOperational) {
        logger.info(error);
        response.status(error.httpCode).json({
            success: false,
            error: error.name,
            errors: error.errors,
        });
        return;
    }

    // Dangerous error, must be documented fully
    logger.error({
        ...error,
        stack: error instanceof ExtendedError ? error.stack : "handled",
    });
    response.status(500).json({
        success: false,
        error: 'UNKNOWN ERROR',
        errors: ['Something happened. Please contact support'],
    });
    // Terminate the current process signaling that it has exited with an error.
    process.exit(1);
});


/**
 * Catch all routes — 404
 */
app.use('/', (request, response) => {
    response.status(404).json({
        success: false,
        error: 'NOT_FOUND',
        errors: [`Route ${ request.method } ${ request.originalUrl } not found`],
    });
});

/**
 * Error handling LAST RESORT
 * Nothing should go there.
 */
const unhandledRejections = new Map();
process
    // emitted when the list of unhandled rejections grows
    .on('unhandledRejection', (reason, promise) => {
        // helps prevent promises from failing silently, ensuring that every rejection is either accounted for or resolved
        logger.error(reason);
        unhandledRejections.set(promise, reason);
    })
    // emitted when the list of unhandled rejections shrinks.
    .on('rejectionHandled', (promise) =>
        unhandledRejections.delete(promise)
    )
    // safeguard against unexpected errors that could crash the application
    .on('uncaughtException', (error, origin) => {
        // if development: no need (otherwise I would log all test errors + node server closing
        if (process.env.NODE_ENV !== 'production')
            return;
        logger.error({
            message: error.message,
            stack: error.stack,
            name: error.name,
            origin
        });
        process.exit(1);
    });
