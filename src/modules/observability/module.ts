/**
 * @module
 * The operator-facing view of the running service: health, a metrics overview, the live SSE
 * stream, the Prometheus scrape endpoint, and the audit trail.
 *
 * Depends on `audit-logs` for `GET /observability/audit`; everything else comes from
 * `infrastructure/observability`, which measures the process, not any domain.
 *
 * Every route is authenticated, but not with the same style — see `routes.ts` for why the SSE
 * stream uses a cookie and the scrape endpoint a static credential.
 *
 * No `index.ts`: this module owns URLs, not data, so it has nothing to promise a sibling. Boundary
 * lint makes that structural — a sibling cannot import this module at all.
 *
 * ── Position ───────────────────────────────────────────────────────────────────────────────
 * Reaches:      audit-logs
 * Reached by:   nothing
 * Not imports:  reads every domain's counters BY STRING off the shared registry
 *               (`metricsRegistry.getSingleMetric('auth_login_total')`), never by import. That is
 *               deliberate — it is what lets this module report on domains it may not name — and it
 *               is why `metric-names.test.ts` exists. Renaming a counter compiles fine and breaks
 *               this silently.
 */

import path from 'node:path';
import type { AppModule } from '@kernel/registry';
import { router } from './routes';

/** This module's manifest entry: routes and locales — no event subscriptions, no seeds. */
export default {
    name: 'observability',
    basePath: '/observability',
    routes: router,
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
