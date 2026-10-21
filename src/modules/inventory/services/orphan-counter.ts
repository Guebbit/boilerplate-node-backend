/**
 * @module
 * The counter behind the `PaidOrderWithoutHold` alert. It lives apart from `../metrics.ts` on
 * purpose: that file registers two gauges whose `collect` queries the database, and loading it
 * here would put them on the registry of every test or process that merely imports the holds.
 *
 * See: docs/modules/inventory-reservations.md#orphaned-hold
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';

/**
 * Orders that are paid, or shipping, with no hold to settle: the stock side of the sale cannot be
 * completed. Labelled by the step that found it, `commit` (payment) or `ship` (dispatch), because
 * the fix differs (see the runbook in `docs/modules/inventory-reservations.md#orphaned-hold`).
 * `ship` fires only when no hold exists at all. `commit` also fires for a released hold the shelf
 * could not cover when the payment landed. Any increase is a human's call.
 */
export const inventoryCommitOrphanedTotal = new Counter({
    name: 'inventory_commit_orphaned_total',
    help: 'Paid or shipping orders found with no hold to settle, by the step that found them.',
    labelNames: ['stage'],
    registers: [metricsRegistry]
});

// Zero from startup, so an `increase()` alert sees the first orphan after a restart. The stages
// are the ones `raiseOrphanAlarm` in `holds.ts` takes.
// https://prometheus.io/docs/practices/instrumentation/#avoid-missing-metrics
for (const stage of ['commit', 'ship']) inventoryCommitOrphanedTotal.inc({ stage }, 0);
