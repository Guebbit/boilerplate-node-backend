#!/usr/bin/env node

/**
 * @module
 * The process entry point: builds the Express app, wires infrastructure (OTel, cache, queue,
 * i18n), mounts every enabled module, and owns the start/stop lifecycle. OTel initializes before
 * anything it instruments is imported — the only ordering constraint the rest of the file exists
 * to preserve.
 */

// OTel must initialize before express/http/mongoose are imported.
import { startTracing } from '@infrastructure/runtime/otel-sdk';
startTracing();

import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import i18next from 'i18next';
import mongoose from 'mongoose';
import { start } from '@infrastructure/runtime/database';
import { startCache } from '@infrastructure/adapters/cache';
import { startQueue } from '@infrastructure/adapters/queue';
import { registerWorkers } from '@app/workers';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';
import { shutdownInfra, registerSignalHandlers } from '@infrastructure/runtime/server-lifecycle';
import {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources,
    refreshLocaleOverrides,
    registerLocaleDirectories,
    startLocaleOverrideRefresh
} from '@infrastructure/i18n';

import { registerModules, resolveTranslatables } from '@kernel/registry';
import { enabledModules } from './modules';
import { setTranslatables } from '@modules/locales/module';

import { applyServerTimeouts, installSecurity } from '@app/security';
import { installRequestContext } from '@app/request-context';
import { installTelemetry } from '@app/telemetry';
import { installStatic } from '@app/static-assets';
import { installRoutes } from '@app/routes';
import { installErrorHandling } from '@app/error-handling';
import { installDemo, isDemoMode, restoreScenario } from '@app/demo';

/**
 * Server start
 */
export const app = express();

/** Fallback port when `NODE_PORT` is unset. */
const DEFAULT_PORT = 3000;

/** The server this process is currently listening on, if any. */
let activeServer: Server | undefined;

/** In-flight shutdown, so a second call joins it instead of closing twice. */
let shutdownPromise: Promise<void> | undefined;

/**
 * Everything a request needs answering except a socket to arrive on: the database, the cache, the
 * queue and its workers, then i18n and the validation messages that read through it.
 *
 * Separate from {@link startServer} for one caller — `scenarios/apply.ts` drives the real flows
 * against a loopback listener of its own and must not bind `NODE_PORT` on a container boot. It is
 * also the honest split: nothing below this line is about listening.
 */
export const bootInfrastructure = () => {
    /*
     * Off in production only, and set before `start()` connects: an index built at connect time is
     * what makes a TTL-window change fail the boot outright, since Mongo refuses to rebuild an
     * index over conflicting options. `docker-compose.production.yml`'s `setup` service runs
     * `db:sync` before this process ever starts, which is what reconciles the index set instead.
     * Dev and test keep Mongoose's own default (on), which is what gives the test suites their
     * constraints for free. https://mongoosejs.com/docs/guide.html#autoIndex
     */
    mongoose.set('autoIndex', process.env.NODE_ENV !== 'production');

    return (
        Promise.resolve()
            .then(() => start())
            .then(() => startCache())
            .then(() => startQueue())
            .then(() => registerWorkers())
            .then(() => {
                // Modules carry their own copy, so deleting one deletes its strings. `infrastructure` sits
                // below every module and cannot go looking for them, so the paths are handed in —
                // and they must be handed in BEFORE `init`, which reads the merged result.
                registerLocaleDirectories(
                    enabledModules
                        .map((appModule) => appModule.locales)
                        .filter((directory) => directory !== undefined)
                );
            })
            .then(() =>
                // Every dictionary in src/locales is registered, so dropping in a file is the only
                // step needed to add a language — the middleware negotiates against the same list.
                i18next.init({
                    lng: getDefaultLocale(),
                    fallbackLng: getFallbackLocale(),
                    supportedLngs: listSupportedLocales(),
                    resources: loadLocaleResources()
                })
            )
            /*
             * Layer whatever has been edited on top of the files just loaded, then keep doing it.
             *
             * NOT awaited for correctness — `refreshLocaleOverrides` never rejects and an empty overlay
             * is a working state — but awaited for ordering: a request served between `init` and the
             * first refresh would answer with un-overridden copy, and boot is the one moment where
             * waiting a few milliseconds to avoid that costs nothing.
             */
            .then(() => refreshLocaleOverrides())
            .then(() => startLocaleOverrideRefresh())
            /*
             * After i18n, because the map resolves its copy through `t`. Registering it earlier
             * would install a translator with no dictionary behind it.
             */
            .then(() => registerValidationMessages())
            .then(() => undefined)
    );
};

/**
 * Boot sequence: {@link bootInfrastructure}, the demo profile's own data, then listen. Idempotent
 * — a second call while the server is already listening resolves with the running instance rather
 * than binding twice.
 */
export const startServer = () => {
    if (activeServer?.listening) return Promise.resolve(activeServer);

    return (
        bootInfrastructure()
            /*
             * Only in demo mode, and only ever the initial build — `npm run demo`'s own
             * `POST /__test/restore` replays it from memory afterwards. Before `listen`, so the
             * paired frontend's readiness probe (`GET /`, which only resolves once listening)
             * never observes a shop that is connected but has not lived its history yet: the
             * flows this runs drive the app on a throwaway loopback listener of their own.
             */
            .then(() => (isDemoMode() ? restoreScenario() : undefined))
            .then(
                () =>
                    new Promise<Server>((resolve) => {
                        const port = environmentNumber('NODE_PORT', DEFAULT_PORT, 1);
                        // Unset by default, which binds every interface — the shape every
                        // profile but the demo one wants. `run-server.ts` sets it to loopback:
                        // the demo profile's tokens are signed with a public, hard-coded secret,
                        // so binding every interface would let anyone on the LAN mint one.
                        const host = process.env.NODE_HOST?.trim();
                        logger.info('------------- SERVER START -------------');
                        const onListening = () => {
                            logger.info(`Server listening on port ${port}`);
                            activeServer = server;
                            resolve(server);
                        };
                        const server = host
                            ? app.listen(port, host, onListening)
                            : app.listen(port, onListening);
                        /*
                         * After `listen`, because the server object is what carries them — and
                         * before the first request can arrive, because they bound how long one may
                         * take to send. See `app/security.ts`.
                         */
                        applyServerTimeouts(server);
                    })
            )
    );
};

/**
 * Graceful shutdown. The in-flight promise is memoised, so concurrent callers (a signal handler
 * and a test's `afterAll`) share one shutdown rather than racing two.
 */
export const stopServer = () => {
    if (shutdownPromise) return shutdownPromise;

    shutdownPromise = shutdownInfra(activeServer).finally(() => {
        activeServer = undefined;
        shutdownPromise = undefined;
    });

    return shutdownPromise;
};

/*
 * The middleware stack, in the order a request travels it.
 *
 * Express applies middleware in registration order, so this sequence IS the behaviour, not a
 * summary of it. Four dependencies are load-bearing and none of them is visible from a call site:
 *
 * - security precedes everything, because `trust proxy` decides what `request.ip` means and the
 *   rate limiter keys its buckets on it;
 * - request context precedes the routes, because every controller reads the request id, the
 *   observability handle and the negotiated locale it attaches;
 * - telemetry precedes the routes so its timer wraps the handler rather than following it;
 * - error handling comes last, because an express error handler only catches what was mounted
 *   before it.
 *
 * Each install owns the ordering *within* its own group and documents it there.
 */
/*
 * Validate the module registry and attach every module's domain-event handlers before the first
 * route exists. A cycle or a missing dependency stops the boot here, with the offending path named,
 * rather than surfacing as a 500 on whichever request happens to cross the gap first.
 */
registerModules(enabledModules);

/*
 * `locales` cannot collect every module's `translatables` entry itself — the same wall that keeps
 * `@infrastructure/i18n`'s translation port free of any `src/modules/*` import — so the app tier
 * builds the lookup and hands it in, the one direction data may cross that boundary. Alongside
 * `registerModules` above, not inside `startServer()`: a translation write must be validatable the
 * moment this file is imported, the same as every other module-registry fact, not only once the
 * process actually starts listening.
 */
setTranslatables(resolveTranslatables(enabledModules));

installSecurity(app);
installRequestContext(app);
installTelemetry(app);
installStatic(app);
// Demo control surface (/__test/restore, /__test/scenario, /__test/emails) — inert outside
// `npm run demo`. Before installRoutes, whose 404 catch-all would swallow anything mounted after it.
if (isDemoMode()) installDemo(app);
installRoutes(app);
installErrorHandling(app);

/*
 * Auto-start, for every process that imports this file wanting a SERVER.
 *
 * Two do not, and both want the `app` object alone: jest, and `scenarios/apply.ts`, which boots
 * the infrastructure itself and drives the flows on a loopback listener rather than binding
 * `NODE_PORT` on a container boot. The environment is the only channel that can carry that
 * decision — importing this file IS the side effect, so no export of it could be read in time.
 */
if (process.env.NODE_ENV !== 'test' && process.env.NODE_APP_NO_LISTEN !== '1') {
    registerSignalHandlers(stopServer);
    void startServer().catch((error: unknown) =>
        logger.error({ message: '------------- SERVER ERROR -------------', error })
    );
}
