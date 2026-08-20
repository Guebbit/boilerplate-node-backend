#!/usr/bin/env node

// OTel must initialize before express/http/mongoose are imported.
import { startTracing } from '@infrastructure/runtime/otel-sdk';
startTracing();

import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import i18next from 'i18next';
import { start } from '@infrastructure/runtime/database';
import { startCache } from '@infrastructure/adapters/cache';
import { startQueue } from '@infrastructure/adapters/queue';
import { registerWorkers } from '@app/workers';
import { logger } from '@infrastructure/adapters/logger';
import { validateRequiredEnvironment } from '@infrastructure/runtime/environment';
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

import { registerModules } from '@kernel/registry';
import { enabledModules } from './modules';

import { installSecurity } from '@app/security';
import { installRequestContext } from '@app/request-context';
import { installTelemetry } from '@app/telemetry';
import { installStatic } from '@app/static-assets';
import { installRoutes } from '@app/routes';
import { installErrorHandling } from '@app/error-handling';
import { installDemo, isDemoMode } from '@app/demo';

/**
 * Server start
 */
export const app = express();
const DEFAULT_PORT = 3000;
let activeServer: Server | undefined;
let shutdownPromise: Promise<void> | undefined;

/*
 * Parse port from env with fallback to default
 */
const getPort = () => {
    const parsedPort = Number.parseInt(process.env.NODE_PORT ?? String(DEFAULT_PORT), 10);
    return Number.isNaN(parsedPort) ? DEFAULT_PORT : parsedPort;
};

/*
 * Boot sequence: validate env → connect infra → mount i18n → listen
 */
export const startServer = () => {
    if (activeServer?.listening) return Promise.resolve(activeServer);

    return (
        Promise.resolve()
            .then(() => validateRequiredEnvironment())
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
            .then(
                () =>
                    new Promise<Server>((resolve) => {
                        const port = getPort();
                        logger.info('------------- SERVER START -------------');
                        const server = app.listen(port, () => {
                            logger.info(`Server listening on port ${port}`);
                            activeServer = server;
                            resolve(server);
                        });
                    })
            )
    );
};

/*
 * Graceful shutdown wrapper — ensures single execution
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

installSecurity(app);
installRequestContext(app);
installTelemetry(app);
installStatic(app);
// Demo control surface (reset + outbox) — inert outside `npm run demo`. Before installRoutes,
// whose 404 catch-all would swallow anything mounted after it.
if (isDemoMode()) installDemo(app);
installRoutes(app);
installErrorHandling(app);

/*
 * Auto-start in non-test environments
 */
if (process.env.NODE_ENV !== 'test') {
    registerSignalHandlers(stopServer);
    void startServer().catch((error: Error) =>
        logger.error('------------- SERVER ERROR -------------', error)
    );
}
