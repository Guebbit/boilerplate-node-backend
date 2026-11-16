/**
 * @module
 * Graceful shutdown orchestration — closing the server and tearing down infra in a fixed order,
 * with a deadline so a stuck teardown cannot hang the process forever. Decoupled from Express
 * middleware and route mounting: this file only sequences the stop calls each adapter already
 * exposes, it does not know how any one of them stops.
 */

import type { Server } from 'node:http';
import type { Express } from 'express';
import { logger } from '@infrastructure/adapters/logger';
import { shutdownAnalytics } from '@infrastructure/observability/analytics';
import { shutdownTracing } from '@infrastructure/runtime/otel-sdk';
import { stopDatabase } from '@infrastructure/runtime/database';
import { stopCache } from '@infrastructure/adapters/cache';
import { stopLimitsRedis } from '@infrastructure/adapters/limits-redis';
import { stopConsuming, stopQueue } from '@infrastructure/adapters/queue';
import { stopLocaleOverrideRefresh } from '@infrastructure/i18n';
import { settleRenders } from '@infrastructure/adapters/pdf';
import { settleIdempotencyMarks } from '@infrastructure/http/middlewares/idempotency';
import { endSseStreams } from '@infrastructure/http/sse';
import { isTestEnvironment, serverConfig } from '@infrastructure/runtime/config';
import { markServerDraining } from '@infrastructure/runtime/readiness';

/**
 * The teardown budget (`NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`, default 15 s): what the steps below
 * share, counted from the end of the lame-duck delay (`NODE_SHUTDOWN_DELAY_MS`). After it we stop
 * being polite and kill the process.
 *
 * Keep delay + this below the orchestrator's own grace period (Kubernetes
 * `terminationGracePeriodSeconds`, default 30 s; Docker `stop_grace_period`, default 10 s),
 * otherwise the platform SIGKILLs the container mid-drain and the timeout never fires.
 *
 * @see docs/operate/health-checks.md#shutting-down-behind-a-load-balancer
 */
const getShutdownTimeoutMs = () => serverConfig().NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS;

/**
 * Bind `app` and resolve once it is actually listening; reject when the bind fails.
 *
 * Express 5's `listen` hands a bind error (EADDRINUSE, EACCES) to the same callback as success,
 * so a callback that ignores its argument reports "listening" on a socket that never opened.
 * https://expressjs.com/en/5x/api.html#app.listen
 *
 * @param app - the application to serve
 * @param port - the port to bind
 * @param host - the interface to bind; every interface when unset
 */
export const listenOn = (app: Express, port: number, host?: string): Promise<Server> =>
    new Promise<Server>((resolve, reject) => {
        const onListening = (error?: Error) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(server);
        };
        const server = host ? app.listen(port, host, onListening) : app.listen(port, onListening);
    });

/**
 * A boot that failed: tear down whatever did start, then exit non-zero.
 *
 * Exiting is the point. A process that connected to Mongo but never listened stays alive on that
 * socket, and a restart policy only acts on a process that exited.
 *
 * @param error - why the boot failed
 * @param stopFunction - the teardown to run first (normally `createApp()`'s own `stop`)
 */
export const failBoot = (error: unknown, stopFunction: () => Promise<void>): Promise<void> => {
    // Stryker disable next-line all
    logger.error({ message: '------------- SERVER ERROR -------------', error });
    return stopFunction()
        .catch(() => undefined)
        .finally(() => process.exit(1));
};

/**
 * How the teardown budget is split between the steps of {@link shutdownInfra}, as shares of
 * `NODE_GRACEFUL_SHUTDOWN_TIMEOUT_MS`. Each step waits at most its share and usually far less.
 * They sum to less than 1 on purpose: the rest is left for the stores behind them (cache,
 * database, telemetry) to close cleanly before the forced exit.
 *
 * - `drain`:       the server drains before its remaining connections are cut;
 * - `renders`:     in-flight PDF renders, after the drain; below what the drain leaves over;
 * - `inFlight`:    the caller's own in-flight work (`shutdownInfra`'s `settleInFlight`); small,
 *                  because whatever it waits for is recoverable;
 * - `idempotency`: the ledger's pending done-marks; one small write each, so a ceiling for a
 *                  stalled database, not an expected wait;
 * - `queue`:       running queue handlers, before the broker connection closes.
 */
export const SHUTDOWN_SHARES = {
    drain: 0.3,
    renders: 0.25,
    inFlight: 0.1,
    idempotency: 0.05,
    queue: 0.2
} as const;

/**
 * The longest a step may wait, in ms.
 *
 * @param share - the step's entry in {@link SHUTDOWN_SHARES}
 */
const budgetMs = (share: number): number => getShutdownTimeoutMs() * share;

/**
 * Promisify server.close() — resolves once all connections are drained.
 *
 * `http.Server.close()` stops accepting new connections while letting in-flight requests finish,
 * and only fires its callback once the last socket closes. Three things would hold it open:
 *
 * - idle keep-alive sockets: closed straight away, since nothing is running on them;
 * - an SSE stream, which never ends on its own: ended first, each told when to reconnect;
 * - any other response that outlives its share of the budget: cut then, so the queue, database
 *   and telemetry still get their turn to close before the forced exit.
 *
 * https://nodejs.org/api/http.html#servercloseallconnections
 */
export const closeServer = (server: Server) =>
    new Promise<void>((resolve, reject) => {
        const cutTimer = setTimeout(
            () => server.closeAllConnections(),
            budgetMs(SHUTDOWN_SHARES.drain)
        );
        // Must not, on its own, keep a process alive that has nothing else left to do.
        cutTimer.unref();
        endSseStreams();
        server.close((error) => {
            clearTimeout(cutTimer);
            if (error) {
                reject(error);
                return;
            }
            resolve();
        });
        server.closeIdleConnections();
    });

/**
 * Graceful shutdown: close server, drain connections, then stop infra in the reverse of startup —
 * traffic first, then things nothing still-serving traffic needs, then the stores in-flight
 * requests were using, and analytics/tracing last since they buffer in memory and must capture
 * the teardown above them. Each step swallows its own failures, so a broken Redis cannot prevent
 * the database from closing.
 *
 * @param server - the HTTP server to drain, when there is one
 * @param settleInFlight - waits for work the layers above started and infrastructure cannot see
 *   (it may not import them), given the longest it may take in ms; runs before the stores close
 */
export const shutdownInfra = (
    server?: Server,
    settleInFlight?: (timeoutMs: number) => Promise<void>
) =>
    /**
     * `Promise.resolve(server)` starts the chain uniformly whether or not a server was passed
     * (workers and CLI entry points call this without one).
     */
    Promise.resolve(server)
        .then((s) => {
            /**
             * `listening` is false when the server never bound or is already closed;
             * calling `close()` then would reject for no useful reason.
             */
            if (!s?.listening) return;
            return closeServer(s);
        })
        .then(() => stopLocaleOverrideRefresh())
        /**
         * Renders already started finish (or time out) before the process can exit: an exit
         * mid-render orphans the Chromium it launched, and its temporary profile with it.
         */
        .then(() => settleRenders(budgetMs(SHUTDOWN_SHARES.renders)))
        /**
         * Done-marks written after an answer went out finish before the database closes: cut, one
         * strands its key in flight, which a do-not-retry client sees as a false "outcome unknown".
         */
        .then(() => settleIdempotencyMarks(budgetMs(SHUTDOWN_SHARES.idempotency)))
        /**
         * Work the caller started (event deliveries) finishes before the queue and database go:
         * cut mid-write, it would log errors against a closed client on every deploy.
         */
        .then(() => settleInFlight?.(budgetMs(SHUTDOWN_SHARES.inFlight)))
        /**
         * The queue before the cache: a job still running would otherwise reopen the cache
         * connection that was just closed under it.
         */
        .then(() => stopQueue(budgetMs(SHUTDOWN_SHARES.queue)))
        .then(() => stopCache())
        .then(() => stopLimitsRedis())
        .then(() => stopDatabase())
        .then(() => shutdownAnalytics())
        .then(() => shutdownTracing());

/**
 * Waits `ms` — a timer that, unlike the forced-exit one, keeps the process alive.
 *
 * @param ms - how long to wait; 0 resolves on the next timer tick
 */
const wait = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });

/**
 * The handler for a shutdown signal: the first one runs the whole sequence, every later one is
 * ignored (a second signal must not start a second teardown on top of the first).
 *
 * ```
 * signal ─▶ /readyz 503 + Connection: close ─▶ stop taking queue jobs ─▶ lame-duck delay
 *        ─▶ stopFunction (end SSE, close server, settle work, close stores) ─▶ exit 0
 * ```
 *
 * A load balancer needs the delay: its poll must see the 503 and stop routing here BEFORE the
 * listener closes, or a request already sent to this copy meets a closed socket.
 *
 * @param stopFunction - the teardown to run (normally a closure over `shutdownInfra`)
 * @returns the listener to register on the signals
 */
export const createShutdownHandler = (stopFunction: () => Promise<void>) => {
    let shuttingDown = false;

    return (signal: NodeJS.Signals) => {
        if (shuttingDown) {
            // Stryker disable next-line all
            logger.info(`Received ${signal} again, graceful shutdown is already running.`);
            return;
        }
        shuttingDown = true;
        // Stryker disable next-line all
        logger.info(`Received ${signal}, starting graceful shutdown.`);

        // `GET /readyz` answers 503 and every response says `Connection: close`, from here on.
        markServerDraining();

        const delayMs = serverConfig().NODE_SHUTDOWN_DELAY_MS;

        /**
         * Deadline: if teardown hangs (a socket that never drains, a broker that never
         * answers) exit anyway with a failure code, so the orchestrator restarts us
         * instead of leaving a zombie container that answers no traffic. The delay is outside
         * the teardown budget, so it is outside this count too.
         */
        const forcedExitTimer = setTimeout(() => {
            // Stryker disable next-line all
            logger.error('Graceful shutdown timeout reached. Forcing process exit.');
            process.exit(1);
        }, delayMs + getShutdownTimeoutMs());
        /**
         * `unref()` removes the timer from the event loop's reference count, so if teardown
         * finishes early this pending timeout does not by itself keep the process alive.
         */
        forcedExitTimer.unref();

        /**
         * `void` marks the floating promise as intentional (the handler cannot be async:
         * Node ignores a returned promise from a signal listener).
         */
        void stopConsuming()
            .then(() => wait(delayMs))
            .then(() => stopFunction())
            .then(() => {
                // Stryker disable next-line all
                logger.info('Graceful shutdown completed.');
                /**
                 * Explicit exit(0): lingering handles (OTel timers, driver sockets) could
                 * otherwise keep the event loop alive well past the actual shutdown.
                 */
                process.exit(0);
            })
            .catch((error: unknown) => {
                // Stryker disable all
                logger.error({
                    message: 'Graceful shutdown failed.',
                    error
                });
                // Stryker restore all
                // Non-zero code so the platform records an unclean stop.
                process.exit(1);
            });
    };
};

/**
 * Register process signal handlers for graceful shutdown.
 *
 * @param stopFunction - the teardown to run (normally a closure over `shutdownInfra`)
 */
export const registerSignalHandlers = (stopFunction: () => Promise<void>) => {
    /**
     * Jest runs many suites in one process and sends signals of its own; installing
     * `process.exit()` handlers there would kill the test runner mid-run.
     */
    if (isTestEnvironment()) return;

    const onProcessSignal = createShutdownHandler(stopFunction);

    // SIGTERM — how orchestrators (Docker/Kubernetes/systemd) ask a container to stop.
    process.on('SIGTERM', () => onProcessSignal('SIGTERM'));
    // SIGINT — Ctrl-C in a local terminal; same path so dev and prod behave identically.
    process.on('SIGINT', () => onProcessSignal('SIGINT'));
};
