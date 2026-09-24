/**
 * This is the MAIN file of the repo (check "package.json") so we can use clusters.
 *
 * Keep it the entry point in production. It is what makes OTel start before `app` loads express
 * and mongoose: `app` is imported dynamically below, while a static import is hoisted above any
 * statement — including the `startTracing()` call in `app.ts` itself.
 */
// First: every other import reads the environment, and this is what loads `.env` into it.
import 'dotenv/config';
// OTel must initialize before any other module is loaded.
import { startTracing } from '@infrastructure/runtime/otel-sdk';
startTracing();

import os from 'node:os';
import cluster from 'node:cluster';
import { logger } from '@infrastructure/adapters/logger';
import { environmentFlag, environmentNumber } from '@infrastructure/runtime/environment';
import { crashVerdict, workerTarget } from '@infrastructure/runtime/cluster-policy';

/**
 * Cluster management
 * https://www.digitalocean.com/community/tutorials/how-to-scale-node-js-applications-with-clustering
 */
const CLUSTER_ENABLED = environmentFlag('NODE_ENABLE_CLUSTERING', false);

/** Fallback for `NODE_CLUSTER_CRASH_WINDOW_MS`: window a worker's crashes are counted over. */
const DEFAULT_CRASH_WINDOW_MS = 60_000;

/** Fallback for `NODE_CLUSTER_CRASH_BACKOFF_BASE_MS`: delay before the first respawn after a crash. */
const DEFAULT_CRASH_BACKOFF_BASE_MS = 500;

/** Fallback for `NODE_CLUSTER_CRASH_BACKOFF_MAX_MS`: ceiling the respawn backoff doubles up to. */
const DEFAULT_CRASH_BACKOFF_MAX_MS = 30_000;

/** Fallback for `NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS`: grace period before the primary kills a worker. */
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

/** Fallback for `NODE_CLUSTER_CRASH_LIMIT`: crashes in one window before the primary gives up. */
const DEFAULT_CRASH_LIMIT = 10;

if (cluster.isPrimary && CLUSTER_ENABLED) {
    const workers = workerTarget(
        environmentNumber('NODE_CLUSTER_WORKERS', 0),
        os.availableParallelism()
    );
    const crashWindowMs = environmentNumber(
        'NODE_CLUSTER_CRASH_WINDOW_MS',
        DEFAULT_CRASH_WINDOW_MS,
        1
    );
    const crashBackoffBaseMs = environmentNumber(
        'NODE_CLUSTER_CRASH_BACKOFF_BASE_MS',
        DEFAULT_CRASH_BACKOFF_BASE_MS,
        1
    );
    const crashBackoffMaxMs = environmentNumber(
        'NODE_CLUSTER_CRASH_BACKOFF_MAX_MS',
        DEFAULT_CRASH_BACKOFF_MAX_MS,
        1
    );
    const shutdownTimeoutMs = environmentNumber(
        'NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS',
        DEFAULT_SHUTDOWN_TIMEOUT_MS,
        1
    );
    const crashLimit = environmentNumber('NODE_CLUSTER_CRASH_LIMIT', DEFAULT_CRASH_LIMIT, 1);

    let isShuttingDown = false;
    const crashHistory: number[] = [];
    const respawnTimers = new Set<NodeJS.Timeout>();
    const getWorkers = () => Object.values(cluster.workers ?? {});

    const clearRespawnTimers = () => {
        for (const timer of respawnTimers) clearTimeout(timer);
        respawnTimers.clear();
    };

    const forkWorker = () => {
        if (isShuttingDown) return;
        const worker = cluster.fork();
        // Stryker disable next-line all
        logger.info(`Forked worker ${worker.process.pid}.`);
    };

    const scheduleRespawn = (delayMs: number) => {
        if (isShuttingDown) return;

        const timer = setTimeout(() => {
            respawnTimers.delete(timer);
            forkWorker();
        }, delayMs);
        timer.unref();
        respawnTimers.add(timer);
    };

    const shouldRespawn = (
        code: number | null,
        signal: string | null,
        exitedAfterDisconnect: boolean
    ) => {
        if (isShuttingDown) return false;
        if (exitedAfterDisconnect) return false;
        if (code === 0) return false;
        if (signal === 'SIGTERM' || signal === 'SIGINT') return false;
        return true;
    };

    const startPrimaryShutdown = (signal: NodeJS.Signals) => {
        if (isShuttingDown) return;
        isShuttingDown = true;
        clearRespawnTimers();

        // Stryker disable next-line all
        logger.info(`Primary received ${signal}; starting coordinated shutdown.`);

        for (const worker of getWorkers()) {
            if (!worker) continue;
            worker.process.kill('SIGTERM');
        }

        const forceShutdownTimer = setTimeout(() => {
            // Stryker disable next-line all
            logger.warn('Cluster shutdown timeout reached; forcing remaining workers.');
            for (const worker of getWorkers()) {
                if (!worker) continue;
                worker.process.kill('SIGKILL');
            }
            process.exitCode = 1;
        }, shutdownTimeoutMs);
        forceShutdownTimer.unref();
    };

    // Stryker disable next-line all
    logger.info(`Primary pid=${process.pid} starting ${workers} workers.`);
    for (let index = 0; index < workers; index += 1) forkWorker();

    cluster.on('exit', (worker, code, signal) => {
        // Stryker disable all
        logger.info(`Worker ${worker.process.pid} exited.`, {
            code,
            signal,
            exitedAfterDisconnect: worker.exitedAfterDisconnect
        });
        // Stryker restore all

        if (isShuttingDown) {
            const aliveWorkers = getWorkers().filter(Boolean).length;
            if (aliveWorkers === 0) {
                // Stryker disable next-line all
                logger.info('All workers exited; primary shutting down.');
                // `??=`: a forced shutdown or a crash loop already recorded a failure, and the
                // last worker's exit must not overwrite it with success.
                process.exitCode ??= 0;
            }
            return;
        }

        if (!shouldRespawn(code, signal, worker.exitedAfterDisconnect)) return;

        const verdict = crashVerdict(crashHistory, Date.now(), {
            windowMs: crashWindowMs,
            backoffBaseMs: crashBackoffBaseMs,
            backoffMaxMs: crashBackoffMaxMs,
            maxCrashes: crashLimit
        });
        crashHistory.length = 0;
        crashHistory.push(...verdict.recentCrashes);

        if (verdict.action === 'give-up') {
            // Stryker disable next-line all
            logger.error(
                `Workers crashed ${verdict.recentCrashes.length} times in ${crashWindowMs}ms; giving up so the supervisor sees the failure.`
            );
            process.exitCode = 1;
            startPrimaryShutdown('SIGTERM');
            return;
        }

        // Stryker disable all
        logger.warn(`Worker crash detected. Respawning in ${verdict.delayMs}ms.`, {
            crashCountInWindow: verdict.recentCrashes.length,
            crashWindowMs
        });
        // Stryker restore all
        scheduleRespawn(verdict.delayMs);
    });

    process.on('SIGTERM', () => startPrimaryShutdown('SIGTERM'));
    process.on('SIGINT', () => startPrimaryShutdown('SIGINT'));
} else {
    /**
     * Workers execute the app module
     */

    void import('./app');
}
