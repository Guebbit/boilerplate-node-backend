/**
 * @module
 * Domain counters this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without importing here.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

/**
 * Audit entries the compliance log recorded but the queryable trail did not.
 *
 * `record()` swallows persistence failures on purpose (a lost Mongo copy must never turn a login
 * into a 500), but that means `GET /observability/audit` fails silently too — `{ items: [] }`
 * looks the same as "nothing happened". A counter, not an alert, since nothing is actually lost.
 * Do NOT make the sink awaitable to drive this to zero — the fail-open is the point, not a gap.
 */
export const auditSinkFailuresTotal = new Counter({
    name: 'audit_sink_failures_total',
    help: 'Audit entries written to the log but not persisted to the queryable trail.',
    registers: [metricsRegistry]
});
