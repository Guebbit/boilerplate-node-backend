/**
 * @module
 * Queue metrics (Prometheus). One counter, and it exists because a parked job is otherwise only
 * visible to whoever happens to read the log line at the moment it happens. Registers against the
 * shared registry the same way every module's own `metrics.ts` does — see `metrics-registry.ts`.
 *
 * See: docs/tools/prometheus.md
 */

import { Counter } from 'prom-client';
import { metricsRegistry } from './metrics-registry';

/**
 * Jobs parked in `<queue>.dead` — a permanent rejection (malformed, contract-invalid,
 * handler-refused) or a thrown error that exhausted every retry. Makes visible: a queue that keeps
 * parking jobs is a dependency that is down or a bug that is deterministic, and neither shows up
 * any other way — nothing ever reads `<queue>.dead` on its own. A rate above zero is the alert
 * (`QueueJobsParked` in `prometheus.alert-rules.yaml`), not a threshold on top of it.
 */
export const queueJobsDeadLetteredTotal = new Counter({
    name: 'queue_jobs_dead_lettered_total',
    help: 'Jobs parked in a dead-letter queue, by queue name.',
    // Bounded by construction: queue names come from WORKER_CHANNELS, never request data.
    labelNames: ['queue'] as const,
    registers: [metricsRegistry]
});
