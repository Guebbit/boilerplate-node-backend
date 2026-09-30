/**
 * @module
 * The transactional outbox: a domain event written in the SAME Mongo transaction as the state
 * change it announces, and published afterwards by a relay. The in-process bus (`./events`) has
 * no durability; this is the durable path for an event that must not be lost.
 *
 * Guarantee:  at-least-once. The relay marks a row published only after every consumer returned.
 *             A crash in between re-dispatches it, so a consumer dedupes on `meta.eventId`.
 * Ordering:   per aggregate. An aggregate's oldest unpublished row blocks its later ones.
 * Failure:    retried with exponential backoff, parked as `dead` after the last attempt.
 *             A dead row never blocks its aggregate.
 * Relayers:   the writer nudges one right after commit (fast path), and `sweep:outbox` runs one
 *             every minute (the backstop). Both are safe together — a row is claimed by a lease.
 *
 * See: docs/tools/outbox.md
 */

import mongoose, { model, Schema } from 'mongoose';
import type { ClientSession, Document, Model } from 'mongoose';
import { Gauge } from 'prom-client';
import { extractErrorMessage } from '@guebbit/js-toolkit';
import { logger } from '@infrastructure/adapters/logger';
import { environmentNumber } from '@infrastructure/runtime/environment';
import { metricsRegistry } from '@infrastructure/observability/metrics-registry';
import {
    outboxEventsDeadTotal,
    outboxEventsPublishedTotal,
    outboxEventsRetriedTotal
} from '@infrastructure/observability/metrics-outbox';
import {
    domainEventsWired,
    emitDomainEvent,
    type DomainEventMap,
    type DomainEventName
} from './events';

/** Where an outbox row is in its life. `dead` is terminal and needs an operator. */
export type OutboxStatus = 'pending' | 'published' | 'dead';

/** One stored outbox row. */
export interface OutboxEventDocument extends Document {
    /** The domain event's name (`payment.succeeded`). */
    name: string;
    /** The domain event's payload, exactly as `emitDomainEvent` will receive it. */
    payload: unknown;
    /** What the event is about (an order id). Rows sharing it are dispatched in write order. */
    aggregateId: string;
    status: OutboxStatus;
    /** Dispatch attempts that failed so far. */
    attempts: number;
    /** Not dispatched before this. Moves out with each failure, so backoff needs no timer. */
    nextAttemptAt: Date;
    /** A relay's claim on the row. Expires on its own, so a crashed relay frees it. */
    lockedUntil?: Date;
    lastError?: string;
    /** Set on publish; the TTL index below reads it to clean published rows. */
    publishedAt?: Date;
    createdAt: Date;
}

/** Mongoose model type for {@link OutboxEventDocument}. */
export type OutboxEventModel = Model<OutboxEventDocument>;

/** Outbox collection schema. */
export const outboxEventSchema = new Schema<OutboxEventDocument, OutboxEventModel>(
    {
        name: { type: String, required: true },
        payload: { type: Schema.Types.Mixed, required: true },
        aggregateId: { type: String, required: true },
        status: { type: String, enum: ['pending', 'published', 'dead'], default: 'pending' },
        attempts: { type: Number, default: 0 },
        nextAttemptAt: { type: Date, required: true },
        lockedUntil: { type: Date },
        lastError: { type: String },
        publishedAt: { type: Date }
    },
    { timestamps: { createdAt: true, updatedAt: false } }
);

/**
 * Days a PUBLISHED row is kept before Mongo's TTL index removes it. Dead rows have no
 * `publishedAt`, so they stay until an operator deals with them.
 */
const outboxRetentionDays = environmentNumber('NODE_OUTBOX_RETENTION_DAYS', 7, 1);

/*
 * The relay's read: pending rows in write order, grouped by aggregate.
 */
outboxEventSchema.index({ status: 1, createdAt: 1, _id: 1 });

/*
 * Cleanup of published rows. Same caveat as every TTL index here: changing
 * `NODE_OUTBOX_RETENTION_DAYS` and restarting fails the boot until `npm run db:sync` rebuilds it.
 */
outboxEventSchema.index(
    { publishedAt: 1 },
    { expireAfterSeconds: outboxRetentionDays * 24 * 60 * 60 }
);

/** Outbox model entrypoint. Collection `outboxevents`. */
export const outboxEventModel = model<OutboxEventDocument, OutboxEventModel>(
    'OutboxEvent',
    outboxEventSchema
);

/** Failed dispatches before a row is parked as `dead`. */
const outboxMaxAttempts = (): number => environmentNumber('NODE_OUTBOX_MAX_ATTEMPTS', 10, 1);

/** Seconds a relay's claim on a row lasts. Must outlast one dispatch, or a slow one is duplicated. */
const outboxLeaseSeconds = (): number => environmentNumber('NODE_OUTBOX_LEASE_SECONDS', 60, 1);

/** Backoff after the first failure. Doubles each time. */
const BACKOFF_BASE_MS = 5000;

/** Backoff never exceeds this, however many attempts have failed. */
const BACKOFF_CAP_MS = 3_600_000;

/**
 * Wait before the next dispatch after `failedAttempts` failures: 5s, 10s, 20s ... capped at 1h.
 * No jitter: the rows are claimed one aggregate at a time, so there is no herd to spread.
 *
 * @param failedAttempts - how many dispatches of this row have failed (1-based)
 */
export const outboxBackoffMs = (failedAttempts: number): number =>
    Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** (failedAttempts - 1));

/**
 * Write an event to the outbox, inside the caller's transaction.
 *
 * The session is required, not optional: an outbox row written outside the transaction is the
 * exact bug this exists to remove. It becomes visible to the relay only when that transaction
 * commits, and vanishes with it if it aborts.
 *
 * @param name - the domain event
 * @param payload - the event's payload
 * @param aggregateId - what the event is about; per-aggregate ordering keys on it
 * @param session - the transaction's session (`withTransaction`'s argument)
 */
export const enqueueOutboxEvent = <TEventName extends DomainEventName>(
    name: TEventName,
    payload: DomainEventMap[TEventName],
    aggregateId: string,
    session: ClientSession
): Promise<void> =>
    // Mongoose: `create` takes `{ session }` only in its array form.
    // https://mongoosejs.com/docs/transactions.html
    outboxEventModel
        .create([{ name, payload, aggregateId, nextAttemptAt: new Date() }], { session })
        .then(() => undefined);

/** A row as the relay reads it: plain, from the aggregation. */
interface OutboxRow {
    _id: mongoose.Types.ObjectId;
    name: string;
    payload: unknown;
    attempts: number;
}

/** What one relay pass did. */
export interface RelayResult {
    published: number;
    retried: number;
    dead: number;
}

/**
 * Each aggregate's oldest unpublished row, when that row is due and unclaimed.
 *
 * The head is picked BEFORE the due filter, on purpose: a head waiting out its backoff, or held by
 * another relay, must keep its aggregate's later rows waiting — skipping it would reorder.
 */
const findHeads = (limit: number): Promise<OutboxRow[]> => {
    const now = new Date();
    return outboxEventModel
        .aggregate<OutboxRow>([
            { $match: { status: 'pending' } },
            { $sort: { createdAt: 1, _id: 1 } },
            { $group: { _id: '$aggregateId', head: { $first: '$$ROOT' } } },
            { $replaceRoot: { newRoot: '$head' } },
            {
                $match: {
                    nextAttemptAt: { $lte: now },
                    $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }]
                }
            },
            { $sort: { createdAt: 1, _id: 1 } },
            { $limit: limit }
        ])
        .exec();
};

/**
 * Take the row's lease. One atomic write, so of two relays reaching the same row exactly one wins.
 *
 * @returns whether this caller now holds the row
 */
const claim = (row: OutboxRow): Promise<boolean> => {
    const now = new Date();
    return outboxEventModel
        .findOneAndUpdate(
            {
                _id: row._id,
                status: 'pending',
                $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: { $lt: now } }]
            },
            { $set: { lockedUntil: new Date(now.getTime() + outboxLeaseSeconds() * 1000) } }
        )
        .exec()
        .then((claimed) => claimed !== null);
};

/** Hand one row to the event bus. A consumer that throws answers `false`, never rejects. */
const dispatch = (row: OutboxRow): Promise<boolean> =>
    // `name` came from a `DomainEventName` at enqueue time, but a stored string cannot prove that
    // to the compiler; a name nobody subscribes to any more simply has no handlers.
    emitDomainEvent(row.name as DomainEventName, row.payload as never, {
        eventId: String(row._id)
    }).catch(() => false);

/** Mark a dispatched row published. Conditional, so a row a peer already finished is left alone. */
const markPublished = (row: OutboxRow): Promise<unknown> =>
    outboxEventModel
        .updateOne(
            { _id: row._id, status: 'pending' },
            { $set: { status: 'published', publishedAt: new Date() }, $unset: { lockedUntil: 1 } }
        )
        .exec();

/**
 * Record a failed dispatch: reschedule with backoff, or park the row once the attempts are spent.
 *
 * @returns `dead` when the row was parked, `retried` otherwise
 */
const markFailed = (row: OutboxRow): Promise<'retried' | 'dead'> => {
    const attempts = row.attempts + 1;
    const isDead = attempts >= outboxMaxAttempts();
    const lastError = `${row.name}: a consumer failed (attempt ${String(attempts)})`;
    return outboxEventModel
        .updateOne(
            { _id: row._id, status: 'pending' },
            {
                $set: {
                    attempts,
                    lastError,
                    status: isDead ? 'dead' : 'pending',
                    nextAttemptAt: new Date(Date.now() + outboxBackoffMs(attempts))
                },
                $unset: { lockedUntil: 1 }
            }
        )
        .exec()
        .then(() => {
            if (isDead)
                // Stryker disable next-line all
                logger.error({
                    message: `Outbox: parked ${row.name} as dead`,
                    eventId: String(row._id),
                    attempts
                });
            return isDead ? 'dead' : 'retried';
        });
};

/** Claim, dispatch and settle one head row. */
const relayOne = (row: OutboxRow): Promise<keyof RelayResult | 'skipped'> =>
    claim(row).then((won) => {
        if (!won) return 'skipped';
        return dispatch(row).then((ok) =>
            ok ? markPublished(row).then(() => 'published' as const) : markFailed(row)
        );
    });

/** Tally a settled row into the metrics and the pass's result. */
const tally = (result: RelayResult, outcome: keyof RelayResult | 'skipped'): void => {
    if (outcome === 'skipped') return;
    result[outcome] += 1;
    if (outcome === 'published') outboxEventsPublishedTotal.inc();
    if (outcome === 'retried') outboxEventsRetriedTotal.inc();
    if (outcome === 'dead') outboxEventsDeadTotal.inc();
};

/** A full pass's ceiling on heads per round, so a backlog cannot pin the relay for long. */
const HEADS_PER_ROUND = 50;

/** Rounds per pass. A round drains one row per aggregate, so this is the per-aggregate depth. */
const MAX_ROUNDS = 20;

/**
 * Publish every due outbox event, oldest first per aggregate.
 *
 * Rows of DIFFERENT aggregates in a round run in parallel; rows of one aggregate never do — the
 * next one only becomes a head once the previous is published. Safe to run from several processes.
 *
 * @returns what this pass published, rescheduled and parked
 */
export const relayOutbox = async (): Promise<RelayResult> => {
    const result: RelayResult = { published: 0, retried: 0, dead: 0 };

    // Nobody is subscribed here (a script that never called `registerModules`): dispatching would
    // mark rows published with no listener. Leave them for a process that is wired.
    if (!domainEventsWired()) return result;

    for (let round = 0; round < MAX_ROUNDS; round += 1) {
        const heads = await findHeads(HEADS_PER_ROUND);
        const outcomes = await Promise.all(heads.map((row) => relayOne(row)));
        for (const outcome of outcomes) tally(result, outcome);
        // Nothing settled: every head is claimed elsewhere or backing off, so another round is idle.
        if (outcomes.every((outcome) => outcome === 'skipped')) break;
    }

    return result;
};

/** Relay passes started by {@link nudgeOutbox} that have not finished yet. */
const nudges = new Set<Promise<unknown>>();

/**
 * Start a relay pass without waiting for it — call right AFTER the transaction that enqueued
 * commits, so the event goes out in milliseconds instead of at the next sweep.
 *
 * Never throws: a failed nudge only means the sweep publishes it a minute later.
 */
export const nudgeOutbox = (): void => {
    const pass: Promise<unknown> = relayOutbox().catch((error: unknown) => {
        // Stryker disable next-line all
        logger.warn({
            message: 'Outbox: nudge failed, the sweep will publish it',
            error: extractErrorMessage(error, String(error))
        });
    });
    nudges.add(pass);
    void pass.finally(() => nudges.delete(pass));
};

/**
 * Wait for every nudged pass to finish. For graceful shutdown, and for a test that needs the
 * event delivered before it asserts.
 */
export const settleOutboxNudges = (): Promise<void> => Promise.all(nudges).then(() => undefined);

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
        if (mongoose.connection.readyState !== mongoose.ConnectionStates.connected) return;
        return outboxEventModel
            .countDocuments({ status: 'pending' })
            .exec()
            .then((count) => {
                this.set(count);
            })
            .catch(() => undefined);
    }
});
