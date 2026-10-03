/**
 * @module
 * `createApp()`: builds one Express application — infrastructure (OTel, cache, queue, i18n),
 * every enabled module mounted — and hands back its start/stop lifecycle. OTel
 * initializes before anything it instruments is imported — the only ordering constraint the
 * rest of the file exists to preserve.
 *
 * Calling it is the side effect (registering modules, mounting middleware), not IMPORTING it —
 * `tests/support/http.ts` calls it once for the `app` object alone, `scenarios/apply.ts` calls
 * `boot()` but never `start()`. Nothing here decides to serve traffic: `src/serve.ts` is the one
 * place that calls `start()` and wires it to the process signals, for whichever entry point
 * (`cluster.ts`'s worker branch, `dev:docker`) actually wants a listening server.
 */

// First: the tracing setup below already reads config, and the config store reads the environment
// once — `.env` has to be loaded before that read.
import './infrastructure/config/dotenv';

// OTel must initialize before express/http/mongoose are imported. That only holds when
// `cluster.ts` is the entry and imports this file dynamically: as the entry itself, the static
// imports below are hoisted above this call.
import { startTracing } from '@infrastructure/runtime/otel-sdk';

/** Start the OpenTelemetry SDK; see the note above for when this call is early enough. */
startTracing();

import express from 'express';
import type { Express } from 'express';
import type { Server } from 'node:http';
import { installEnvironment, type EnvironmentOverrides } from '@infrastructure/config/store';
import { start as startDatabase } from '@infrastructure/runtime/database';
import { startCache } from '@infrastructure/adapters/cache';
import { startQueue } from '@infrastructure/adapters/queue';
import { registerWorkers } from '@app/workers';
import { registerTemplateDirectories } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';
import { serverConfig } from '@infrastructure/runtime/config';
import { registerValidationMessages } from '@infrastructure/http/validation-messages';
import { listenOn, shutdownInfra } from '@infrastructure/runtime/server-lifecycle';
import { markServerListening } from '@infrastructure/runtime/readiness';
import {
    bootI18n,
    isLocaleOverrideAvailable,
    refreshLocaleOverrides,
    startLocaleOverrideRefresh
} from '@infrastructure/i18n';
import { isTranslationAvailable } from '@kernel/translation';

import { registerModules } from '@kernel/registry';
import { enabledModules, enabledModuleLocales, enabledModuleTemplateDirectories } from './modules';
import { APP_CONFIG_SLICES, securityTxtSettings } from '@app/config';
import { securityTxtWarning } from '@app/security-txt';

import { applyServerTimeouts, installRequestParsing, installSecurity } from '@app/security';
import { installRequestContext } from '@app/request-context';
import { installTelemetry } from '@app/telemetry';
import { installStatic } from '@app/static-assets';
import { installRoutes } from '@app/routes';
import { installErrorHandling } from '@app/error-handling';
import { installDemo, restoreScenario } from '@app/demo';
import { isDemoMode } from '@infrastructure/runtime/demo-profile';

/** One built application's lifecycle — what {@link createApp} hands back. */
export interface AppInstance {
    /** The mounted Express application — a supertest agent's whole surface, no boot needed. */
    app: Express;
    /**
     * The database, the cache, the queue and its workers, then i18n and the validation messages
     * that read through it — everything a request needs answering except a socket to arrive on.
     * Separate from {@link AppInstance.start} for one caller — `scenarios/apply.ts` drives the
     * real flows against a loopback listener of its own and must not bind `NODE_PORT` on a
     * container boot.
     */
    boot: () => Promise<void>;
    /**
     * {@link AppInstance.boot}, the demo profile's own data, then listen. Idempotent — a second
     * call while the server is already listening resolves with the running instance rather than
     * binding twice.
     */
    start: () => Promise<Server>;
    /**
     * Graceful shutdown. The in-flight promise is memoised, so concurrent callers (a signal
     * handler and a test's `afterAll`) share one shutdown rather than racing two.
     */
    stop: () => Promise<void>;
}

/** What {@link createApp} takes. */
export interface AppOptions {
    /**
     * Environment variables to run this app with, laid over the process environment (`undefined`
     * unsets one). They pass through the same parser and boot gate as the real ones.
     *
     * Process-wide, because the config slices are: the last app built wins. Read-at-import
     * settings (a limiter's budget) only see it if it was installed before the first import of
     * this file — `scenarios/apply.ts` does that with `installEnvironment` itself.
     */
    env?: EnvironmentOverrides;
}

/**
 * Builds one Express application, synchronously: validates every module's required config,
 * attaches its domain-event handlers, lets each pull whatever cross-module lookup it needs
 * (`locales`' `translatables`, `account`'s `personalData` sections) through its own
 * `onRegistered` hook, then mounts the middleware stack and every route — all before the first
 * request can arrive, and all before `boot()` or `start()` are ever called, so a caller that
 * only wants `.app` (a supertest agent) needs neither.
 *
 * Callable more than once — each call is an independent instance with its own `activeServer`/
 * `shutdownPromise` closure, so `boot`/`start`/`stop` take no config of their own: the one
 * parameter is {@link AppOptions}, applied before anything below reads a setting.
 *
 * @param options - the environment to build with, if not the process's own
 */
export const createApp = (options: AppOptions = {}): AppInstance => {
    if (options.env) installEnvironment(options.env);

    const app = express();

    /** The server this instance is currently listening on, if any. */
    let activeServer: Server | undefined;

    /** In-flight shutdown, so a second call joins it instead of closing twice. */
    let shutdownPromise: Promise<void> | undefined;

    const boot = (): Promise<void> =>
        Promise.resolve()
            .then(() => startDatabase())
            .then(() => startCache())
            .then(() => startQueue())
            .then(() => registerWorkers())
            .then(() =>
                // Modules carry their own copy, so deleting one deletes its strings. `infrastructure`
                // sits below every module and cannot go looking for them, so the paths are handed in.
                // Every dictionary in src/locales is registered, so dropping in a file is the only
                // step needed to add a language — the middleware negotiates against the same list.
                bootI18n(enabledModuleLocales())
            )
            .then(() => {
                // Same reasoning, for a module's own EJS templates — before the first
                // request or queue job that could resolve a template name against them.
                registerTemplateDirectories(enabledModuleTemplateDirectories());
            })
            /*
             * Layer whatever has been edited on top of the files just loaded, then keep doing it.
             *
             * NOT awaited for correctness — `refreshLocaleOverrides` never rejects and an empty overlay
             * is a working state — but awaited for ordering: a request served between `init` and the
             * first refresh would answer with un-overridden copy, and boot is the one moment where
             * waiting a few milliseconds to avoid that costs nothing.
             */
            .then(() => refreshLocaleOverrides())
            // No provider (`locales` uninstalled) means every refresh would be a no-op forever —
            // a timer with nothing to poll is a leak of intent, not just of a file descriptor.
            .then(() => {
                if (isLocaleOverrideAvailable()) startLocaleOverrideRefresh();
            })
            /*
             * After i18n, because the map resolves its copy through `t`. Registering it earlier
             * would install a translator with no dictionary behind it.
             */
            .then(() => registerValidationMessages())
            .then(() => undefined);

    const start = (): Promise<Server> => {
        if (activeServer?.listening) return Promise.resolve(activeServer);

        return (
            boot()
                /*
                 * Only in demo mode, and only ever the initial build — `npm run demo`'s own
                 * `POST /__test/restore` replays it from memory afterwards. Before `listen`, so the
                 * paired frontend's readiness probe (`GET /`, which only resolves once listening)
                 * never observes a shop that is connected but has not lived its history yet: the
                 * flows this runs drive the app on a throwaway loopback listener of their own.
                 */
                .then(() => (isDemoMode() ? restoreScenario() : undefined))
                .then(() => {
                    const { NODE_PORT: port, NODE_HOST: host } = serverConfig();
                    // Unset by default, which binds every interface — the shape every profile but
                    // the demo one wants. `run-server.ts` sets it to loopback: the demo profile's
                    // tokens are signed with a public, hard-coded secret, so binding every interface
                    // would let anyone on the LAN mint one.
                    // Stryker disable next-line all
                    logger.info('------------- SERVER START -------------');
                    return listenOn(app, port, host).then((server) => {
                        /*
                         * Before the first request can arrive, because they bound how long one may
                         * take to send. See `app/security.ts`.
                         */
                        applyServerTimeouts(server);
                        // Stryker disable next-line all
                        logger.info(`Server listening on port ${String(port)}`);
                        activeServer = server;
                        // `GET /readyz` starts answering 200 only from here — see `readiness.ts`.
                        markServerListening();
                        return server;
                    });
                })
        );
    };

    const stop = (): Promise<void> => {
        if (shutdownPromise) return shutdownPromise;

        shutdownPromise = shutdownInfra(activeServer).finally(() => {
            activeServer = undefined;
            shutdownPromise = undefined;
        });

        return shutdownPromise;
    };

    registerModules(enabledModules, APP_CONFIG_SLICES);

    // Not a refusal: a boilerplate must boot unconfigured. But a stale security.txt is worse than none.
    const securityTxtProblem = securityTxtWarning(securityTxtSettings());
    if (securityTxtProblem) logger.warn({ message: securityTxtProblem });

    // `locales` being absent is a supported deployment shape, not a
    // misconfiguration — this is the one line that says so, once, rather than a reader inferring it
    // from an admin screen that quietly has nothing to show.
    if (!isTranslationAvailable())
        logger.info('translation provider: none — content is monolingual');

    /*
     * The middleware stack, in the order a request travels it.
     *
     * Express applies middleware in registration order, so this sequence IS the behaviour, not a
     * summary of it. Five dependencies are load-bearing and none of them is visible from a call site:
     *
     * - security precedes everything, because `trust proxy` decides what `request.ip` means and the
     *   rate limiter keys its buckets on it;
     * - static files come before the rate limiter, so the images a page loads do not spend the
     *   caller's request budget — and before request context and telemetry, which they do not need;
     * - request context precedes the routes, because every controller reads the request id, the
     *   observability handle and the negotiated locale it attaches;
     * - telemetry precedes the routes so its timer wraps the handler rather than following it;
     * - error handling comes last, because an express error handler only catches what was mounted
     *   before it.
     *
     * Each install owns the ordering *within* its own group and documents it there.
     */
    installSecurity(app);
    installStatic(app);
    installRequestParsing(app);
    installRequestContext(app);
    installTelemetry(app);
    // Demo control surface (/__test/restore, /__test/scenario, /__test/emails) — inert outside
    // `npm run demo`. Before installRoutes, whose 404 catch-all would swallow anything mounted after it.
    if (isDemoMode()) installDemo(app);
    installRoutes(app);
    installErrorHandling(app);

    return { app, boot, start, stop };
};
