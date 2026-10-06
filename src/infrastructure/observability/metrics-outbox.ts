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
    name: 'outbox_pending_events',
    help: 'Outbox events written but not yet published (includes ones backing off).',
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
