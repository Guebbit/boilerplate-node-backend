#!/usr/bin/env node

// OTel must initialize before express/http/mongoose are imported.
import { startTracing } from '@core/bootstrap/otel-sdk';
startTracing();

import 'dotenv/config';
import express from 'express';
import type { Server } from 'node:http';
import i18next from 'i18next';
import { start } from '@core/bootstrap/database';
import { registerAuditSink } from '@core/observability/audit';
import { auditLogService } from '@services/audit-logs';
import { startCache } from '@core/adapters/cache';
import { startQueue } from '@core/adapters/queue';
import { registerWorkers } from './workers';
import { logger } from '@core/adapters/logger';
import { validateRequiredEnvironment } from '@core/bootstrap/environment';
import { shutdownInfra, registerSignalHandlers } from '@core/bootstrap/server-lifecycle';
import {
    getDefaultLocale,
    getFallbackLocale,
    listSupportedLocales,
    loadLocaleResources
} from '@core/i18n';

import { installSecurity } from './bootstrap/security';
import { installRequestContext } from './bootstrap/request-context';
import { installTelemetry } from './bootstrap/telemetry';
import { installStatic } from './bootstrap/static-assets';
import { installRoutes } from './bootstrap/routes';
import { installErrorHandling } from './bootstrap/error-handling';

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
            // After the database, before anything can serve a request: from here on every
            // `emitAuditEvent` is also stored, not just logged. Registered rather than imported by
            // `@core/observability/audit` itself, which sits below `@services/*` and may not reach up
            // to it — see `IAuditSink`.
            .then(() => registerAuditSink(auditLogService.record))
            .then(() => startCache())
            .then(() => startQueue())
            .then(() => registerWorkers())
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
installSecurity(app);
installRequestContext(app);
installTelemetry(app);
installStatic(app);
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
