/**
 * @module
 * The operator-facing view of the running service: health, a metrics overview, the live SSE
 * stream, the Prometheus scrape endpoint, and the audit trail. Depends on `audit-logs` for
 * `GET /observability/audit`; the readiness fold, job health, the process reader, the SSE hub and
 * the scrape guard are this module's own files — they implement this module's own routes and
 * nothing else imports them — only the Prometheus registry and the HTTP counters it reads by name
 * stay in `infrastructure/observability`,
 * since every module registers onto that same registry. Every route is authenticated, but not
 * with the same style — see `routes.ts`. The barrel (`./index.ts`) republishes `./services` —
 * health, job/dependency health, the process reader, the SSE stream — for a sibling that ends up
 * needing one; nothing does today.
 *
 * Not in the import graph: reads every domain's counters BY STRING off the shared registry
 *   (`metricsRegistry.getSingleMetric('auth_login_total')`), never by import. That is deliberate —
 *   it is what lets this module report on domains it may not name — and it is why
 *   `metric-names.test.ts` exists. Renaming a counter compiles fine and breaks this silently.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';
import { observabilityConfig } from './config';

/** This module's manifest entry: routes and locales — no event subscriptions, no seeds. */
export default {
    name: 'observability',
    basePath: '/observability',
    /**
     * The permission keys this module introduces. Deleting the module deletes them:
     * `tests/cross-cutting/module-permissions.test.ts` refuses a key in the shared file
     * whose module is gone, and a module claiming one the file does not attribute to it.
     */
    routes: router,
    // The scrape token's placeholder gate and the telemetry sinks: see `./config`.
    config: [observabilityConfig.slice],
    locales: path.join(__dirname, 'locales'),
    // Infrastructure — health, metrics, the audit read endpoint, the SSE stream. Owns no
    // collection of its own; records nothing personal.
    personalData: 'none'
} satisfies AppModule;
