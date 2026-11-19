/**
 * @module
 * Queue metrics (Prometheus). A counter, because a parked job is otherwise only visible to whoever
 * happens to read the log line at the moment it happens; and two gauges over the durable fallback
 * queue, because a held job has no TTL and only an alert says nobody is draining it. Registers
 * against the shared registry the same way every module's own `metrics.ts` does — see
 * `metrics-registry.ts`.
 *
 * @see docs/operate/prometheus.md#what-observability-metrics-exposes
 */

import mongoose from 'mongoose';
import { Counter, Gauge } from 'prom-client';
import { metricsRegistry } from './metrics-registry';
import { counterConfig, gaugeConfig } from '@infrastructure/observability/metric-config';
import { infrastructureMetricData } from '@infrastructure/observability/metrics.generated';

/**
 * Jobs parked in `<queue>.dead` — a permanent rejection (malformed, contract-invalid,
 * handler-refused) or a thrown error that exhausted every retry. Makes visible: a queue that keeps
 * parking jobs is a dependency that is down or a bug that is deterministic, and neither shows up
 * any other way — nothing ever reads `<queue>.dead` on its own. A rate above zero is the alert
 * (`QueueJobsParked` in `prometheus.alert-rules.yaml`), not a threshold on top of it.
 */
export const queueJobsDeadLetteredTotal = new Counter({
    ...counterConfig(infrastructureMetricData.queueJobsDeadLetteredTotal),
    // Bounded by construction: queue names come from WORKER_CHANNELS, never request data.
    registers: [metricsRegistry]
});

/** What the held-jobs gauges need per channel: how many wait, and since when the oldest has. */
export interface HeldJobsSummary {
    channel: string;
    count: number;
    oldestCreatedAt: Date;
}

/**
 * Where the held-jobs summary comes from. Set once by the owner of the `jobs` collection
 * (`persistence/job-store.ts`), because observability sits below persistence and may not import it.
 */
let readHeldJobs: (() => Promise<readonly HeldJobsSummary[]>) | undefined;

/**
 * Register the reader the two held-jobs gauges call at scrape time.
 *
 * @param reader - resolves to one summary per channel that has a held job
 */
export const setHeldJobsReader = (reader: () => Promise<readonly HeldJobsSummary[]>): void => {
    readHeldJobs = reader;
};

/**
 * Run `apply` with a fresh summary, unless there is no reader or Mongo is down: a scrape must
 * answer fast, and the gauge is skipped rather than reported as zero (the same rule as the outbox
 * gauge).
 *
 * @param apply - sets the gauge from the summary
 */
const withHeldJobs = (apply: (held: readonly HeldJobsSummary[]) => void): Promise<void> | void => {
    if (
        readHeldJobs === undefined ||
        mongoose.connection.readyState !== mongoose.ConnectionStates.connected
    )
        return;
    return readHeldJobs()
        .then(apply)
        .catch(() => undefined);
};

/** How many jobs wait in the fallback queue, per channel. A channel with none is absent. */
export const queueHeldJobsGauge = new Gauge({
    ...gaugeConfig(infrastructureMetricData.queueHeldJobs),
    registers: [metricsRegistry],
    collect() {
        return withHeldJobs((held) => {
            this.reset();
            for (const { channel, count } of held) this.set({ channel }, count);
        });
    }
});

/**
 * How long the oldest held job has waited, per channel. Above 15 minutes is the alert
 * (`HeldJobsStuck`): no worker of that role is draining, and nothing else says so.
 */
export const queueHeldJobsOldestAgeGauge = new Gauge({
    ...gaugeConfig(infrastructureMetricData.queueHeldJobsOldestAgeSeconds),
    registers: [metricsRegistry],
    collect() {
        return withHeldJobs((held) => {
            this.reset();
            for (const { channel, oldestCreatedAt } of held)
                this.set({ channel }, Math.max(0, (Date.now() - oldestCreatedAt.getTime()) / 1000));
        });
    }
});
