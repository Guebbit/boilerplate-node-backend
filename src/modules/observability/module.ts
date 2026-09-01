/**
 * @module
 * The operator-facing view of the running service: health, a metrics overview, the live SSE
 * stream, the Prometheus scrape endpoint, and the audit trail. Depends on `audit-logs` for
 * `GET /observability/audit`; everything else comes from `infrastructure/observability`. Every
 * route is authenticated, but not with the same style — see `routes.ts`. No `index.ts`: this
 * module owns URLs, not data, so it has nothing to promise a sibling.
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
    /*
     * BETTER_SECURITY.md wave 2.1: `.env-example` ships `change-me-dev-metrics-token`, which
     * scrapes `/observability/metrics` if left as-is. `minLength: 0` on purpose — UNSET is a
     * supported, already-fail-closed state (`isMetricsScraper` denies by default, 503), so this
     * only refuses to boot on the one dangerous state: the token SET to the known placeholder.
     */
    requiredConfig: [
        { key: 'NODE_METRICS_TOKEN', minLength: 0, placeholder: 'change-me-dev-metrics-token' }
    ],
    locales: path.join(__dirname, 'locales')
} satisfies AppModule;
