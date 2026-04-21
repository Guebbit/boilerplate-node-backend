/**
 * This is the MAIN file of the repo (check "package.json") so we can use clusters.
 * If you don't need clusters, you can just change the MAIN attribute in the "package.json" and use "app.ts"
 */
import os from 'node:os';
import cluster from 'node:cluster';
import { logger } from '@utils/winston';

/**
 * Cluster management
 * https://www.digitalocean.com/community/tutorials/how-to-scale-node-js-applications-with-clustering
 */
const CLUSTER_ENABLED = process.env.NODE_ENABLE_CLUSTERING === '1';
const DEFAULT_CRASH_WINDOW_MS = 60_000;
const DEFAULT_CRASH_BACKOFF_BASE_MS = 500;
const DEFAULT_CRASH_BACKOFF_MAX_MS = 30_000;
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

const parseNumber = (rawValue: string | undefined, fallback: number) => {
    const parsedValue = Number.parseInt(rawValue ?? String(fallback), 10);
    return Number.isNaN(parsedValue) ? fallback : parsedValue;
};

const getWorkerTarget = () => {
    const requestedWorkers = parseNumber(process.env.NODE_CLUSTER_WORKERS, os.cpus().length);
    return requestedWorkers <= 0 ? 1 : requestedWorkers;
};

if (cluster.isPrimary && CLUSTER_ENABLED) {
    const workerTarget = getWorkerTarget();
    const crashWindowMs = parseNumber(process.env.NODE_CLUSTER_CRASH_WINDOW_MS, DEFAULT_CRASH_WINDOW_MS);
    const crashBackoffBaseMs = parseNumber(
        process.env.NODE_CLUSTER_CRASH_BACKOFF_BASE_MS,
        DEFAULT_CRASH_BACKOFF_BASE_MS
    );
    const crashBackoffMaxMs = parseNumber(
        process.env.NODE_CLUSTER_CRASH_BACKOFF_MAX_MS,
        DEFAULT_CRASH_BACKOFF_MAX_MS
    );
    const shutdownTimeoutMs = parseNumber(
        process.env.NODE_CLUSTER_SHUTDOWN_TIMEOUT_MS,
        DEFAULT_SHUTDOWN_TIMEOUT_MS
    );

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

    const shouldRespawn = (code: number | null, signal: string | null, exitedAfterDisconnect: boolean) => {
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

        logger.info(`Primary received ${signal}; starting coordinated shutdown.`);

        for (const worker of getWorkers()) {
            if (!worker) continue;
            worker.process.kill('SIGTERM');
        }

        const forceShutdownTimer = setTimeout(() => {
            logger.warn('Cluster shutdown timeout reached; forcing remaining workers.');
            for (const worker of getWorkers()) {
                if (!worker) continue;
                worker.process.kill('SIGKILL');
            }
            process.exitCode = 1;
        }, shutdownTimeoutMs);
        forceShutdownTimer.unref();
    };

    logger.info(`Primary pid=${process.pid} starting ${workerTarget} workers.`);
    for (let index = 0; index < workerTarget; index += 1) forkWorker();

    cluster.on('exit', (worker, code, signal) => {
        logger.info(`Worker ${worker.process.pid} exited.`, {
            code,
            signal,
            exitedAfterDisconnect: worker.exitedAfterDisconnect
        });

        if (isShuttingDown) {
            const aliveWorkers = getWorkers().filter(Boolean).length;
            if (aliveWorkers === 0) {
                logger.info('All workers exited; primary shutting down.');
                process.exitCode = 0;
            }
            return;
        }

        if (!shouldRespawn(code, signal, worker.exitedAfterDisconnect)) return;

        const now = Date.now();
        const recentCrashes = crashHistory.filter((timestamp) => now - timestamp <= crashWindowMs);
        recentCrashes.push(now);
        crashHistory.length = 0;
        crashHistory.push(...recentCrashes);

        const backoffMultiplier = Math.max(0, recentCrashes.length - 1);
        const respawnDelayMs = Math.min(
            crashBackoffBaseMs * 2 ** backoffMultiplier,
            crashBackoffMaxMs
        );

        logger.warn(`Worker crash detected. Respawning in ${respawnDelayMs}ms.`, {
            crashCountInWindow: recentCrashes.length,
            crashWindowMs
        });
        scheduleRespawn(respawnDelayMs);
    });

    process.on('SIGTERM', () => startPrimaryShutdown('SIGTERM'));
    process.on('SIGINT', () => startPrimaryShutdown('SIGINT'));
} else {
    /**
     * Workers execute the app module
     */

    import('./app');
}
