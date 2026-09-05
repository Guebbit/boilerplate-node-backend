/**
 * @module
 * Graceful shutdown orchestration — closing the server and tearing down infra in a fixed order,
 * with a deadline so a stuck teardown cannot hang the process forever. Decoupled from Express
 * middleware and route mounting: this file only sequences the stop calls each adapter already
 * exposes, it does not know how any one of them stops.
 */

import type { Server } from 'node:http';
import { logger } from '@infrastructure/adapters/logger';
import { shutdownAnalytics } from '@infrastructure/observability/analytics';
import { shutdownTracing } from '@infrastructure/runtime/otel-sdk';
import { stopDatabase } from '@infrastructure/runtime/database';
import { stopCache } from '@infrastructure/adapters/cache';
import { stopRateLimitStore } from '@infrastructure/http/middlewares/rate-limit-store';
import { stopQueue } from '@infrastructure/adapters/queue';
import { stopLocaleOverrideRefresh } from '@infrastructure/i18n';

/** Upper bound on graceful shutdown before we stop being polite and kill the process. */
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 15_000;

/**
 * Read shutdown timeout from env, falling back to the default 15 s.
 *
 * Keep this below the orchestrator's own grace period (Kubernetes
 * `terminationGracePeriodSeconds`, default 30 s; Docker `stop_grace_period`, default 10 s),
 * otherwise the platform SIGKILLs the container mid-drain and the timeout never fires.
 */
export const getShutdownTimeoutMs = () => {
    const parsedTimeout = Number.parseInt(
        process.env.NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS ?? String(DEFAULT_SHUTDOWN_TIMEOUT_MS),
        10
    );
    // `parseInt` returns NaN on garbage input ('abc', ''), which would make the timer fire
    // immediately — fall back instead of shipping a broken grace period.
    return Number.isNaN(parsedTimeout) ? DEFAULT_SHUTDOWN_TIMEOUT_MS : parsedTimeout;
};

/**
 * Promisify server.close() — resolves once all connections are drained.
 *
 * `http.Server.close()` is callback-based, stops accepting new connections while letting
 * in-flight requests finish, and only fires its callback once the last socket is idle.
 */
export const closeServer = (server: Server) =>
    new Promise<void>((resolve, reject) => {
        server.close((error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
    });

/**
 * Graceful shutdown: close server, drain connections, then stop infra in the reverse of startup —
 * traffic first, then things nothing still-serving traffic needs, then the stores in-flight
 * requests were using, and analytics/tracing last since they buffer in memory and must capture
 * the teardown above them. Each step swallows its own failures, so a broken Redis cannot prevent
 * the database from closing.
 */
export const shutdownInfra = (server?: Server) =>
    // `Promise.resolve(server)` starts the chain uniformly whether or not a server was passed
    // (workers and CLI entry points call this without one).
    Promise.resolve(server)
        .then((s) => {
            // `listening` is false when the server never bound or is already closed;
            // calling `close()` then would reject for no useful reason.
            if (!s?.listening) return;
            return closeServer(s);
        })
        .then(() => stopLocaleOverrideRefresh())
        .then(() => stopCache())
        .then(() => stopRateLimitStore())
        .then(() => stopQueue())
        .then(() => stopDatabase())
        .then(() => shutdownAnalytics())
        .then(() => shutdownTracing());

/**
 * Register process signal handlers for graceful shutdown.
 *
 * @param stopFunction - the teardown to run (normally a closure over `shutdownInfra`)
 */
export const registerSignalHandlers = (stopFunction: () => Promise<void>) => {
    // Jest runs many suites in one process and sends signals of its own; installing
    // `process.exit()` handlers there would kill the test runner mid-run.
    if (process.env.NODE_ENV === 'test') return;

    const onProcessSignal = (signal: NodeJS.Signals) => {
        logger.info(`Received ${signal}, starting graceful shutdown.`);

        // Deadline: if teardown hangs (a socket that never drains, a broker that never
        // answers) exit anyway with a failure code, so the orchestrator restarts us
        // instead of leaving a zombie container that answers no traffic.
        const forcedExitTimer = setTimeout(() => {
            logger.error('Graceful shutdown timeout reached. Forcing process exit.');
            process.exit(1);
        }, getShutdownTimeoutMs());
        // `unref()` removes the timer from the event loop's reference count, so if teardown
        // finishes early this pending timeout does not by itself keep the process alive.
        forcedExitTimer.unref();

        // `void` marks the floating promise as intentional (the handler cannot be async:
        // Node ignores a returned promise from a signal listener).
        void Promise.resolve()
            .then(() => stopFunction())
            .then(() => {
                logger.info('Graceful shutdown completed.');
                // Explicit exit(0): lingering handles (OTel timers, driver sockets) could
                // otherwise keep the event loop alive well past the actual shutdown.
                process.exit(0);
            })
            .catch((error: unknown) => {
                logger.error({
                    message: 'Graceful shutdown failed.',
                    error: error instanceof Error ? error.message : String(error)
                });
                // Non-zero code so the platform records an unclean stop.
                process.exit(1);
            });
    };

    // SIGTERM — how orchestrators (Docker/Kubernetes/systemd) ask a container to stop.
    process.on('SIGTERM', () => onProcessSignal('SIGTERM'));
    // SIGINT — Ctrl-C in a local terminal; same path so dev and prod behave identically.
    process.on('SIGINT', () => onProcessSignal('SIGINT'));
};
