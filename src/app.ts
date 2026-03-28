#!/usr/bin/env node

import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction } from "express";
import i18next from 'i18next';
import helmet from "helmet";
import cookieParser from 'cookie-parser';
import { start } from "@utils/database";
import logger from "@utils/winston";
import { rateLimiter } from "@middlewares/security";
import { rejectResponse } from "@utils/response";
import enTranslation from './locales/en.json';

import productRoutes from "./routes/products";
import authRoutes from "./routes/auth";
import orderRoutes from "./routes/orders";
import cartRoutes from "./routes/cart";
import userRoutes from "./routes/users";
import systemRoutes from "./routes";
import { yoga } from "./graphql";

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
app.use(express.json());

/**
 * Parse URL-encoded form bodies (for compatibility)
 */
app.use(express.urlencoded({ extended: true }));

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
    logger.info(`Entering URL: ${ request.protocol }://${ request.get('host') }${ request.originalUrl }`);
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
 * GraphQL endpoint (graphql-yoga)
 * Available at /graphql — includes GraphiQL IDE in non-production environments.
 */
// graphql-yoga's server adapter is callable as Express middleware at runtime;
// the cast resolves the structural type mismatch with the Express overload.
app.use(yoga.graphqlEndpoint, yoga as unknown as Parameters<typeof app.use>[1]);

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
    if (response.headersSent)
        return;

    logger.error({
        message: error.message,
        stack: error.stack,
        name: error.name,
    });

    rejectResponse(response, 500, 'Internal Server Error', [ error.message ]);
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
    .on('rejectionHandled', (promise) =>
        unhandledRejections.delete(promise)
    )
    .on('uncaughtException', (error, origin) => {
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
