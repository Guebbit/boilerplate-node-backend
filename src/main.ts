#!/usr/bin/env node
import 'reflect-metadata';
import 'dotenv/config';

import os from 'node:os';
import cluster from 'node:cluster';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import i18next from 'i18next';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { AllExceptionsFilter } from './filters/all-exceptions.filter';
import { start } from '@utils/database';
import logger from '@utils/winston';
import { rateLimiter } from '@middlewares/security';
import enTranslation from './locales/en.json';

/**
 * Bootstrap the NestJS application.
 * Connects to MongoDB, initialises i18n, and starts listening.
 *
 * Replaces the server-start logic in src/app.ts.
 */
async function bootstrap(): Promise<void> {
    // Connect to MongoDB with exponential-backoff retry
    await start();

    // Initialise i18n translations
    await i18next.init({
        lng: process.env.NODE_DEFAULT_LOCALE ?? 'en',
        fallbackLng: process.env.NODE_FALLBACK_LOCALE ?? 'en',
        resources: {
            en: {
                translation: enTranslation as Record<string, unknown>,
            },
        },
    });

    const app = await NestFactory.create<NestExpressApplication>(AppModule, {
        // Silence NestJS built-in logger; winston handles all logging
        logger: false,
    });

    /**
     * Global middleware – applied before the NestJS pipeline.
     * Order matches the original app.ts.
     */
    app.use(helmet());
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());
    app.use(rateLimiter);
    app.use((request: express.Request, _response: express.Response, next: express.NextFunction) => {
        logger.info(`Entering URL: ${request.protocol}://${String(request.get('host'))}${request.originalUrl}`);
        next();
    });

    /**
     * Global exception filter – formats all errors using the existing
     * rejectResponse shape so the API response contract is preserved.
     */
    app.useGlobalFilters(new AllExceptionsFilter());

    /**
     * Error handling LAST RESORT – mirrors the handlers in the original app.ts.
     */
    const unhandledRejections = new Map<Promise<unknown>, unknown>();
    process
        .on('unhandledRejection', (reason, promise) => {
            logger.error(reason);
            unhandledRejections.set(promise, reason);
        })
        .on('rejectionHandled', promise => unhandledRejections.delete(promise))
        .on('uncaughtException', (error, origin) => {
            if (process.env.NODE_ENV !== 'production')
                return;
            logger.error({
                message: error.message,
                stack: error.stack,
                name: error.name,
                origin,
            });
            process.exit(1);
        });

    const port = process.env.NODE_PORT ?? 3000;
    await app.listen(port);
    logger.info('------------- SERVER START -------------');
}

/**
 * Cluster management – mirrors src/cluster.ts.
 * Forks one worker per CPU core when NODE_ENABLE_CLUSTERING=1.
 */
if (cluster.isPrimary && process.env.NODE_ENABLE_CLUSTERING === '1') {
    const cpuCount = os.cpus().length;
    logger.info(`The total number of CPUs is ${cpuCount}. Primary pid=${process.pid}`);
    for (let i = 0; i < cpuCount; i++)
        cluster.fork();
    cluster.on('exit', (worker, code, signal) => {
        logger.info(`worker ${String(worker.process.pid)} has been killed. Starting another worker.`, { code, signal });
        cluster.fork();
    });
} else {
    bootstrap().catch(error => logger.error('------------- SERVER ERROR -------------', error));
}
