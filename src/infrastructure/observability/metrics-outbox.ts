/**
 * @module
 * Transactional-outbox metrics (Prometheus). Counters only: they are what the relay, in whichever
 * process runs it, can report without a database round trip. The "how many are waiting" gauge
 * lives next to the model it counts (`@kernel/outbox`).
 *
 * See: docs/tools/outbox.md
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from './metrics-registry';

/** Events the relay dispatched and marked published. A duplicate publish counts again. */
export const outboxEventsPublishedTotal = new Counter({
    name: 'outbox_events_published_total',
    help: 'Outbox events dispatched to their consumers and marked published.',
    registers: [metricsRegistry]
});

/** Dispatch attempts that failed and were rescheduled with backoff. */
export const outboxEventsRetriedTotal = new Counter({
    name: 'outbox_events_retried_total',
    help: 'Outbox dispatch attempts that failed and were rescheduled with backoff.',
    registers: [metricsRegistry]
});

/**
 * Events parked as `dead` after exhausting every attempt. A rate above zero is the alert
 * (`OutboxEventsDead`): a consumer is down or a bug is deterministic, and nothing else says so.
 */
export const outboxEventsDeadTotal = new Counter({
    name: 'outbox_events_dead_total',
    help: 'Outbox events parked as dead after exhausting every dispatch attempt.',
    registers: [metricsRegistry]
});
