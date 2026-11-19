/**
 * @module
 * The worker process: takes jobs off the broker, one copy per `worker` service. The web process
 * only publishes; this is where an email is sent, an image digested, a webhook delivered.
 *
 * Boots what a handler needs through the same `bootProcess` the web process calls (stores, queue,
 * translations, mail templates, the admin's copy), after the modules register (event subscriptions
 * and the config gate). Consumers bind last — a job taken before i18n is up renders a key, not a
 * sentence.
 *
 * Owns:        queue consumption, and a small listener: `GET /livez` for the container's health
 *              check and the Prometheus scrape (`NODE_WORKER_PORT`).
 * Does not:    serve the API's routes, run the scheduler (`cron` does) or hold the rate-limit store.
 *
 * @see docs/understand/rabbitmq.md#where-the-code-lives
 */

import express, { type Express } from 'express';
import helmet from 'helmet';
import type { Server } from 'node:http';
import { logger } from '@infrastructure/adapters/logger';
import { rejectResponse } from '@infrastructure/http/response';
import { serverConfig } from '@infrastructure/runtime/config';
import { listenOn } from '@infrastructure/runtime/server-lifecycle';
import { registerModules } from '@kernel/registry';
import { enabledModules } from '../modules';
import { APP_CONFIG_SLICES } from './config';
import { bootProcess, createStop } from './process-boot';
import { registerWorkers } from './workers';

/** What {@link createWorker} returns. */
export interface WorkerInstance {
    /** Connects and binds every consumer, without opening the listener. */
    boot: () => Promise<void>;
    /** `boot`, then the listener. Resolves once it is bound. */
    start: () => Promise<Server>;
    /** Graceful shutdown: stop consuming, let running jobs settle, close the stores. */
    stop: () => Promise<void>;
}

/**
 * The worker's own small HTTP app: `GET /livez` for its container's health check, then whatever
 * the modules declare in `workerMounts` (the Prometheus scrape). No session, rate limit or locale:
 * it is not the API, and nothing here is for a browser.
 *
 * @returns an express app that is not listening yet
 */
const createWorkerApp = (): Express => {
    const app = express();

    // The API's secure headers (it also drops `X-Powered-By`): https://helmetjs.github.io/
    app.use(helmet());

    // Nothing a scraper or a probe asks for may be cached.
    app.use((_request, response, next) => {
        response.setHeader('Cache-Control', 'no-store');
        next();
    });

    // Liveness: the process answers, never a dependency (see docs/operate/health-checks.md).
    app.get('/livez', (_request, response) => {
        response.type('text/plain').send('ok');
    });

    for (const { workerMounts = [] } of enabledModules)
        for (const { basePath, routes } of workerMounts) app.use(basePath, routes);

    // Anything else: the API's problem-details 404, not Express's HTML page.
    app.use((_request, response) => {
        rejectResponse(response, 404);
    });

    return app;
};

/** Everything the web boot does, then the consumers: last, so a job renders with its copy. */
const bootWorker = (): Promise<void> => bootProcess().then(() => registerWorkers());

/**
 * Builds one worker, synchronously — the same split as `createApp`: registering the modules is
 * done here, connecting and consuming wait for `boot`.
 *
 * @returns the worker's `boot`, `start` and `stop`
 */
export const createWorker = (): WorkerInstance => {
    /** The listener this instance opened, if `start` ran. */
    let activeServer: Server | undefined;

    registerModules(enabledModules, APP_CONFIG_SLICES);

    const start = (): Promise<Server> =>
        bootWorker()
            /**
             * Every interface, unlike a sidecar's loopback: the scraper reaches the worker over the
             * network. The only routes are the liveness probe and the token-guarded scrape.
             */
            .then(() => listenOn(createWorkerApp(), serverConfig().NODE_WORKER_PORT))
            .then((server) => {
                activeServer = server;
                logger.info(`Worker listening on port ${String(serverConfig().NODE_WORKER_PORT)}.`);
                return server;
            });

    const stop = createStop(
        () => activeServer,
        () => {
            activeServer = undefined;
        }
    );

    return { boot: bootWorker, start, stop };
};
