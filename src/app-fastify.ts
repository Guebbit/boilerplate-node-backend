#!/usr/bin/env node

import 'dotenv/config';
import Fastify, { type FastifyError } from 'fastify';
import helmet from '@fastify/helmet';
import cookie from '@fastify/cookie';
import rateLimit from '@fastify/rate-limit';
import formbody from '@fastify/formbody';
import i18next from 'i18next';
import { start } from '@utils/database';
import logger from '@utils/winston';
import { rejectResponse } from '@utils/response-fastify';
import enTranslation from './locales/en.json';

import productRoutes from './routes/fastify/products';
import authRoutes from './routes/fastify/auth';
import orderRoutes from './routes/fastify/orders';
import cartRoutes from './routes/fastify/cart';
import userRoutes from './routes/fastify/users';
import systemRoutes from './routes/fastify/index';

/**
 * Build and return the Fastify application instance.
 * Separated from listen() to make it easily testable.
 */
export const buildApp = async () => {
    const fastify = Fastify({
        logger: false,   // We use Winston instead
        trustProxy: true,
    });

    /**
     * Secure headers
     */
    await fastify.register(helmet);

    /**
     * Parse cookies (needed for the JWT refresh-token cookie)
     */
    await fastify.register(cookie);

    /**
     * Security: rate limit all requests before any DB access
     */
    await fastify.register(rateLimit, {
        max: 100,
        timeWindow: 15 * 60 * 1000,    // 15 minutes
    });

    /**
     * Parse URL-encoded form bodies (for compatibility)
     */
    await fastify.register(formbody);

    /**
     * Request logger
     */
    fastify.addHook('onRequest', async (request) => {
        logger.info(`Entering URL: ${request.protocol}://${request.hostname}${request.url}`);
    });

    /**
     * REST API routes
     */
    await fastify.register(authRoutes, { prefix: '/account' });
    await fastify.register(productRoutes, { prefix: '/products' });
    await fastify.register(orderRoutes, { prefix: '/orders' });
    await fastify.register(cartRoutes, { prefix: '/cart' });
    await fastify.register(userRoutes, { prefix: '/users' });
    await fastify.register(systemRoutes);

    /**
     * 404 handler — catch all unmatched routes
     */
    fastify.setNotFoundHandler((_request, reply) => {
        rejectResponse(reply, 404, 'Not Found');
    });

    /**
     * Global JSON error handler
     */
    fastify.setErrorHandler((error: FastifyError, _request, reply) => {
        logger.error({
            message: error.message,
            stack: error.stack,
            name: error.name,
        });

        if (reply.sent)
            return;

        rejectResponse(reply, error.statusCode ?? 500, 'Internal Server Error', [error.message]);
    });

    return fastify;
};

/**
 * Sync database then start server.
 * AFTER sync we can use the database, since it is initialized.
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
    .then(buildApp)
    .then(fastify => fastify.listen({
        port: Number(process.env.NODE_PORT ?? 3000),
        host: '0.0.0.0',
    }))
    .then(address => logger.info(`------------- FASTIFY SERVER START: ${address} -------------`))
    .catch(error => logger.error('------------- SERVER ERROR -------------', error));

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
