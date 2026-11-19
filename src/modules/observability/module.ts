/**
 * @module
 * The operator-facing view of the running service: health, a metrics overview, the live SSE
 * stream, the Prometheus scrape endpoint, and the audit trail. Depends on `audit-logs` for
 * `GET /observability/audit`; the Prometheus registry and the HTTP counters it reads stay in
 * `infrastructure/observability`, since every module registers onto that same registry. Every
 * route is authenticated, but not with the same style — see `routes.ts`.
 *
 * Reaches far: every domain's counters, BY STRING off the shared registry
 *   (`metricsRegistry.getSingleMetric('auth_login_total')`), never by import — so it can report on
 *   domains it may not name. Renaming a counter compiles fine and breaks this silently, which is
 *   why `metric-names.test.ts` exists.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { workerRouter } from './worker-routes';
import { observabilityConfig } from './config';
// Registers the `dependency_up` gauge with the metrics registry at module load.
import './metrics';

/** This module's manifest entry: routes and locales — no event subscriptions, no seeds. */
export default {
    name: 'observability',
    mounts: [{ basePath: '/observability', routes: router }],
    /** The scrape again, on the worker's port: the worker moves counters the API never does. */
    workerMounts: [{ basePath: '/observability', routes: workerRouter }],
    /** The scrape token's placeholder gate and the telemetry sinks: see `./config`. */
    config: [observabilityConfig.slice],
    locales: path.join(__dirname, 'locales'),
    /**
     * Infrastructure — health, metrics, the audit read endpoint, the SSE stream. Owns no
     * collection of its own; the audit rows it writes belong to `audit-logs`.
     */
    personalData: 'none'
} satisfies AppModule;
