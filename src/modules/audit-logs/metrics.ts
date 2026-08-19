/**
 * Domain counters this module owns. See `modules/account/metrics.ts` for why they live in the
 * module rather than in `infrastructure`, and how the overview endpoint reads them without importing here.
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-http';

/**
 * Audit entries the compliance log recorded but the queryable trail did not.
 *
 * The one thing the fail-open sink could not say on its own. `record()` swallows persistence
 * failures on purpose — losing the Mongo copy must never turn a rejected login into a 500 — but the
 * consequence is a dashboard that empties silently: `GET /observability/audit` answering
 * `{ items: [] }` looks exactly like "nothing happened".
 *
 * A counter is the right shape rather than an alert or a retry. The trail is still intact in the
 * logs, so nothing is lost and nothing needs waking anyone; what was missing was any way to notice,
 * and a monotonic counter makes "the sink has been failing for an hour" a graph in the place already
 * built to show one. Do NOT make the sink awaitable to drive this to zero — the fail-open is the
 * point of the design, not a gap in it.
 */
export const auditSinkFailuresTotal = new Counter({
    name: 'audit_sink_failures_total',
    help: 'Audit entries written to the log but not persisted to the queryable trail.',
    registers: [metricsRegistry]
});
