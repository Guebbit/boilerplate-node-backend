/**
 * @module
 * Domain metrics this module owns, registered on the shared `metricsRegistry` so one `/metrics`
 * scrape carries these alongside the HTTP metrics — see `modules/account/metrics.ts` for why they
 * live in the module rather than in `infrastructure`. Built for the two alerts
 * `WebhookDeliveriesFailingEverywhere` and `WebhookRetriesStalled` (`docs/tools/prometheus.md`) —
 * the fleet-wide, our-side-outage signals `docs/modules/webhooks.md`'s delivery-path section
 * describes, distinct from the per-subscription auto-disable email.
 */

import { Counter, Gauge } from 'prom-client';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import { webhookDeliveryRepository } from './repository';

/** A `pending` row this far overdue counts toward {@link _webhookDeliveriesOverdue} — see there. */
const OVERDUE_THRESHOLD_MS = 10 * 60 * 1000;

/**
 * Delivery attempts by outcome (success / failure).
 * Labelled because the ratio is the metric: `WebhookDeliveriesFailingEverywhere` fires on zero
 * successes while failures keep coming — a fleet-wide symptom, distinct from one subscriber's
 * endpoint being down among otherwise-healthy ones.
 */
export const webhookDeliveryAttemptsTotal = new Counter({
    name: 'webhook_delivery_attempts_total',
    help: 'Total webhook delivery attempts, labelled by outcome.',
    labelNames: ['outcome'] as const,
    registers: [metricsRegistry]
});

/**
 * Subscriptions auto-disabled for sustained failure (`domain#shouldAutoDisable`).
 * Unlabelled: every auto-disable is the same event, one subscription going quiet — the alert this
 * feeds cares about volume, not a breakdown.
 */
export const webhookSubscriptionsAutoDisabledTotal = new Counter({
    name: 'webhook_subscriptions_auto_disabled_total',
    help: 'Total subscriptions auto-disabled for sustained delivery failure.',
    registers: [metricsRegistry]
});

/**
 * Pending delivery rows whose `nextAttemptAt` is more than {@link OVERDUE_THRESHOLD_MS} in the
 * past, computed AT SCRAPE TIME via `collect` — same shape as `inventory/metrics.ts`'s low-stock
 * gauge. A nonzero, growing value for 15 minutes straight (`WebhookRetriesStalled`) means the
 * retry sweep itself has stopped running, not that any one delivery is merely retrying on
 * schedule.
 */
const _webhookDeliveriesOverdue = new Gauge({
    name: 'webhook_deliveries_overdue',
    help: 'Pending webhook deliveries whose next attempt is more than 10 minutes overdue.',
    registers: [metricsRegistry],
    async collect() {
        this.set(
            await webhookDeliveryRepository.count({
                status: 'pending',
                nextAttemptAt: { $lt: new Date(Date.now() - OVERDUE_THRESHOLD_MS) }
            })
        );
    }
});
