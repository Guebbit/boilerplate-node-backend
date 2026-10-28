/**
 * @module
 * Transactional-outbox metrics (Prometheus). Counters only: they are what the relay, in whichever
 * process runs it, can report without a database round trip, plus the "how many are waiting" gauge.
 * The gauge cannot import the model it counts (`@kernel/outbox`) — that model's owner hands it a reader.
 *
 * See: docs/tools/outbox.md
 */

import mongoose from 'mongoose';
import { Counter, Gauge } from 'prom-client';
import { metricsRegistry } from './metrics-registry';
import { counterConfig, gaugeConfig } from '@infrastructure/observability/metric-config';
import { infrastructureMetricData } from '@infrastructure/observability/metrics.generated';

/** Events the relay dispatched and marked published. A duplicate publish counts again. */
export const outboxEventsPublishedTotal = new Counter({
    ...counterConfig(infrastructureMetricData.outboxEventsPublishedTotal),
    registers: [metricsRegistry]
});

/** Dispatch attempts that failed and were rescheduled with backoff. */
export const outboxEventsRetriedTotal = new Counter({
    ...counterConfig(infrastructureMetricData.outboxEventsRetriedTotal),
    registers: [metricsRegistry]
});

/**
 * Events parked as `dead` after exhausting every attempt. A rate above zero is the alert
 * (`OutboxEventsDead`): a consumer is down or a bug is deterministic, and nothing else says so.
 */
export const outboxEventsDeadTotal = new Counter({
    ...counterConfig(infrastructureMetricData.outboxEventsDeadTotal),
    registers: [metricsRegistry]
});

/**
 * Where the pending count comes from. Set once by the owner of the outbox model, because
 * observability sits below the kernel and may not import it.
 */
let readPendingCount: (() => Promise<number>) | undefined;

/**
 * Register the reader the `outbox_pending_events` gauge calls at scrape time.
 *
 * @param reader - resolves to the number of rows still `pending`
 */
export const setOutboxPendingReader = (reader: () => Promise<number>): void => {
    readPendingCount = reader;
};

/**
 * How many rows wait to be published. Reads the database at scrape time, because the writer and
 * the relay may be in different processes from the one being scraped. Skipped while Mongo is down,
 * for the same reason the job gauge is: a scrape must answer fast.
 */
const _outboxPendingGauge = new Gauge({
    ...gaugeConfig(infrastructureMetricData.outboxPendingEvents),
    registers: [metricsRegistry],
    collect() {
        if (
            readPendingCount === undefined ||
            mongoose.connection.readyState !== mongoose.ConnectionStates.connected
        )
            return;
        return readPendingCount()
            .then((count) => {
                this.set(count);
            })
            .catch(() => undefined);
    }
});
