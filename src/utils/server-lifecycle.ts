import type { Server } from 'node:http';
import { logger } from '@utils/winston';
import { shutdownAnalytics } from '@utils/analytics';
import { shutdownTracing } from '@utils/tracing';
import { stopDatabase } from '@utils/database';
import { stopCache } from '@utils/cache';
import { stopQueue } from '@utils/queue';

/**
 * Server Lifecycle
 * Single responsibility: graceful startup sequencing and shutdown orchestration.
 * Decoupled from Express middleware and route mounting.
 */

const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

export const getShutdownTimeoutMs = () => {
    const parsedTimeout = Number.parseInt(
        process.env.NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? String(DEFAULT_SHUTDOWN_TIMEOUT_MS),
        10
    );
    return Number.isNaN(parsedTimeout) ? DEFAULT_SHUTDOWN_TIMEOUT_MS : parsedTimeout;
};

export const closeServer = (server: Server) =>
    new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) return reject(error);
            resolve();
        });
    });

/**
 * Graceful shutdown: close server, drain connections, then stop infra.
 */
export const shutdownInfra = (server?: Server) =>
    Promise.resolve(server)
        .then((s) => {
            if (!s?.listening) return;
            return closeServer(s);
        })
        .then(() => stopCache())
        .then(() => stopQueue())
        .then(() => stopDatabase())
        .then(() => shutdownAnalytics())
        .then(() => shutdownTracing());

/**
 * Register process signal handlers for graceful shutdown.
 */
export const registerSignalHandlers = (stopFn: () => Promise<void>) => {
    if (process.env.NODE_ENV === 'test') return;

    const onProcessSignal = (signal: NodeJS.Signals) => {
        logger.info(`Received ${signal}, starting graceful shutdown.`);
        const forcedExitTimer = setTimeout(() => {
            logger.error('Graceful shutdown timeout reached. Forcing process exit.');
            process.exit(1);
        }, getShutdownTimeoutMs());
        forcedExitTimer.unref();

        void Promise.resolve()
            .then(() => stopFn())
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

    process.on('SIGTERM', () => onProcessSignal('SIGTERM'));
    process.on('SIGINT', () => onProcessSignal('SIGINT'));
};
