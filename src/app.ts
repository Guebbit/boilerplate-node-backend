#!/usr/bin/env node

import 'dotenv/config';
import 'reflect-metadata';
import type { Server } from 'node:http';
import i18next from 'i18next';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import type { FastifyInstance } from 'fastify';
import fastifyHelmet from '@fastify/helmet';
import fastifyCors from '@fastify/cors';
import fastifyCookie from '@fastify/cookie';
import fastifyMultipart from '@fastify/multipart';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyFormBody from '@fastify/formbody';
import { start, stopDatabase } from '@utils/database';
import { startCache, stopCache } from '@utils/cache';
import { logger } from '@utils/winston';
import { validateRequiredEnvironment } from '@utils/environment';
import { generateReject } from '@utils/response';
import enTranslation from './locales/en.json';
import { AppModule } from './nest/app.module';

const DEFAULT_PORT = 3000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;
let activeServer: Server | undefined;
let activeNestApplication: NestFastifyApplication | undefined;
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
 * Build the NestJS Fastify application and register native Fastify plugins.
 */
export const createNestFastifyApplication = async () => {
    const nestApplication = await NestFactory.create<NestFastifyApplication>(
        AppModule,
        new FastifyAdapter({
            logger: false
        })
    );

    const fastifyInstance = nestApplication.getHttpAdapter().getInstance() as FastifyInstance;

    // Security headers via native Fastify plugin.
    await fastifyInstance.register(fastifyHelmet);

    // Parse cookie headers so auth refresh flows can read/write cookies.
    await fastifyInstance.register(fastifyCookie);

    // Support application/x-www-form-urlencoded payloads.
    await fastifyInstance.register(fastifyFormBody);

    // Support multipart uploads for image endpoints.
    await fastifyInstance.register(fastifyMultipart);

    // Apply global request rate limits using Fastify-native plugin.
    await fastifyInstance.register(fastifyRateLimit, {
        max: 100,
        timeWindow: '15 minutes'
    });

    const allowedOrigins = new Set(
        (process.env.NODE_CORS_ORIGIN ?? 'http://localhost:5173')
            .split(',')
            .map((origin) => origin.trim())
            .filter(Boolean)
    );

    await fastifyInstance.register(fastifyCors, {
        origin: (origin, callback) => {
            // Fastify CORS callback requires `null` for the no-error branch.
            const noError = undefined as unknown as null;
            if (!origin) return callback(noError, true);
            if (allowedOrigins.has(origin)) return callback(noError, true);
            return callback(new Error(`CORS blocked for origin: ${origin}`), false);
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
        exposedHeaders: ['x-request-id', 'traceparent', 'x-trace-id']
    });

    // Keep the API error envelope consistent even for unmatched routes.
    fastifyInstance.setNotFoundHandler((_request, reply) => {
        reply.status(404).send(generateReject(404, 'Not Found'));
    });

    return {
        nestApplication,
        fastifyInstance
    };
};

/**
 * Sync dependencies then start HTTP server.
 * Exported so tests can control lifecycle explicitly.
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
        .then(async () => {
            const port = getPort();
            logger.info('------------- SERVER START -------------');

            const { nestApplication, fastifyInstance } = await createNestFastifyApplication();
            await nestApplication.listen(port, '0.0.0.0');

            activeNestApplication = nestApplication;
            activeServer = fastifyInstance.server;

            logger.info(`Server listening on port ${port}`);
            return activeServer;
        });
};

/**
 * Memoize shutdown so concurrent callers do not race while closing the same resources.
 */
export const stopServer = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = Promise.resolve(activeNestApplication)
        .then((nestApplication) => {
            if (!nestApplication) return;
            return nestApplication.close();
        })
        .then(() => stopCache())
        .then(() => stopDatabase())
        .finally(() => {
            activeNestApplication = undefined;
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
 * Error handling LAST RESORT.
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
    registerSignalHandlers();
    void startServer().catch((error: Error) =>
        logger.error('------------- SERVER ERROR -------------', error)
    );
}
