import mongoose from 'mongoose';
import type { ClientSession } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironmentOverrides } from '@tests/environment';
import { withTransaction } from '@infrastructure/runtime/database';
import { outboxEventsDeadTotal } from '@infrastructure/observability/metrics-outbox';
import {
    markDomainEventsWired,
    onDomainEvent,
    resetDomainEvents,
    type DomainEventMeta
} from '@kernel/events';
import {
    announceInTransaction,
    announceWithin,
    enqueueOutboxEvent,
    nudgeOutbox,
    OUTBOX_EVENT_DEAD,
    outboxEventModel,
    relayOutbox,
    settleOutboxNudges
} from '@kernel/outbox';

/**
 * The transactional outbox against a real replica-set Mongo: the row commits or aborts with the
 * caller's own transaction, the relay delivers it at-least-once and in order per aggregate, a
 * failing consumer is retried and finally parked, and a relay that died mid-dispatch is recovered
 * without losing the event.
 *
 * @see docs/understand/outbox.md#what-it-guarantees
 */

setupTestDb();

/**
 * A real contracted event stands in for the test's own: the relay refuses a name the `domain-events`
 * contract does not declare. `n` rides in `userId`, which the subscribers read back.
 */
const EVENT = 'account.sessions_revoked' as const;

/** The payload carrying `n`. */
const payload = (n: number) => ({ userId: String(n), reason: 'logout-all' as const });

/** Every delivery a subscriber saw: the payload's `n` and the stable event id. */
let seen: { n: number; eventId?: string }[];

/** Record every delivery, and optionally throw for the ones `failWhen` names. */
const subscribe = (failWhen: (n: number) => boolean = () => false): void => {
    onDomainEvent(EVENT, ({ userId }, meta: DomainEventMeta) => {
        const n = Number(userId);
        if (failWhen(n)) throw new Error('consumer down');
        seen.push({ n, eventId: meta.eventId });
    });
};

/** What the dead-row counter holds; the registry outlives a test, so a case compares before and after. */
const deadCounted = (): Promise<number> =>
    outboxEventsDeadTotal
        .get()
        .then(({ values }) => values.reduce((sum, { value }) => sum + value, 0));

/** Write one event in its own committed transaction. */
const write = (n: number, aggregateId = 'agg-1'): Promise<void> =>
    withTransaction((session) => enqueueOutboxEvent(EVENT, payload(n), aggregateId, session));

/** Make every pending row due now and unclaimed, standing in for the passage of time. */
const makeDue = (): Promise<unknown> =>
    outboxEventModel
        .updateMany(
            { status: 'pending' },
            { $set: { nextAttemptAt: new Date(0) }, $unset: { lockedUntil: 1 } }
        )
        .exec();

beforeEach(() => {
    seen = [];
    resetDomainEvents();
    markDomainEventsWired();
});

afterAll(() => {
    resetDomainEvents();
});

describe('enqueueOutboxEvent', () => {
    it('is written with the transaction: a rolled-back write leaves no event behind', async () => {
        await expect(
            withTransaction(async (session) => {
                await enqueueOutboxEvent(EVENT, payload(1), 'agg-1', session);
                throw new Error('the state change failed');
            })
        ).rejects.toThrow('the state change failed');

        expect(await outboxEventModel.countDocuments()).toBe(0);
    });

    it('is invisible to a reader until the transaction commits', async () => {
        let countInside = -1;

        await withTransaction(async (session) => {
            await enqueueOutboxEvent(EVENT, payload(1), 'agg-1', session);
            // A plain read, outside the session: what the relay would see mid-transaction.
            countInside = await outboxEventModel.countDocuments();
        });

        expect(countInside).toBe(0);
        expect(await outboxEventModel.countDocuments()).toBe(1);
    });
});

describe('relayOutbox', () => {
    it('delivers a committed event once, with the row id as its stable event id', async () => {
        subscribe();
        await write(1);

        const result = await relayOutbox();

        expect(result).toEqual({ published: 1, retried: 0, dead: 0 });
        const row = await outboxEventModel.findOne().lean();
        expect(row?.status).toBe('published');
        expect(row?.publishedAt).toBeInstanceOf(Date);
        expect(seen).toEqual([{ n: 1, eventId: String(row?._id) }]);
        // Published rows are not delivered again.
        expect(await relayOutbox()).toMatchObject({ published: 0 });
    });

    it('keeps write order within one aggregate', async () => {
        subscribe();
        await write(1);
        await write(2);
        await write(3);

        await relayOutbox();

        expect(seen.map(({ n }) => n)).toEqual([1, 2, 3]);
    });

    it('holds an aggregate behind its failing head, while other aggregates carry on', async () => {
        subscribe((n) => n === 1);
        await write(1, 'stuck');
        await write(2, 'stuck');
        await write(3, 'free');

        const result = await relayOutbox();

        // `2` must not overtake `1`; `3` belongs to another aggregate and is delivered.
        expect(seen.map(({ n }) => n)).toEqual([3]);
        expect(result).toMatchObject({ published: 1, retried: 1 });

        // Backoff has passed and the consumer recovered: `1` then `2`, in that order.
        resetDomainEvents();
        markDomainEventsWired();
        subscribe();
        await makeDue();
        await relayOutbox();
        expect(seen.map(({ n }) => n)).toEqual([3, 1, 2]);
    });

    it('reschedules a failed dispatch with backoff, and parks it dead after the last attempt', async () => {
        await withEnvironmentOverrides({ NODE_OUTBOX_MAX_ATTEMPTS: '2' }, async () => {
            subscribe(() => true);
            await write(1);

            expect(await relayOutbox()).toMatchObject({ retried: 1, dead: 0 });
            const retried = await outboxEventModel.findOne().lean();
            expect(retried).toMatchObject({ status: 'pending', attempts: 1 });
            expect(retried?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
            // Not due yet: another pass leaves it alone.
            expect(await relayOutbox()).toMatchObject({ retried: 0 });

            await makeDue();
            expect(await relayOutbox()).toMatchObject({ retried: 0, dead: 1 });
            expect(await outboxEventModel.findOne().lean()).toMatchObject({
                status: 'dead',
                attempts: 2
            });
        });
    });

    it('keeps an empty object in a payload: a hard-deleted product has no titles, and the row must still validate', async () => {
        const delivered: unknown[] = [];
        onDomainEvent('stock_alert.sent', (fact) => {
            delivered.push(fact);
        });
        await withTransaction((session) =>
            enqueueOutboxEvent(
                'stock_alert.sent',
                { userId: 'u-1', productId: 'p-1', titles: {} },
                'u-1',
                session
            )
        );

        expect(await relayOutbox()).toMatchObject({ published: 1, retried: 0 });

        expect(delivered).toEqual([{ userId: 'u-1', productId: 'p-1', titles: {} }]);
    });

    it('drops a field the contract does not know before any consumer sees it', async () => {
        subscribe();
        await outboxEventModel.create({
            name: EVENT,
            payload: { ...payload(1), addedByANewerBuild: true },
            aggregateId: 'agg-1',
            nextAttemptAt: new Date(0)
        });
        let delivered: unknown;
        onDomainEvent(EVENT, (fact) => {
            delivered = fact;
        });

        expect(await relayOutbox()).toMatchObject({ published: 1 });

        expect(delivered).toEqual(payload(1));
    });

    it.each([
        [
            'an event name the contract does not declare',
            { name: 'no.such_event', payload: payload(1) }
        ],
        ['a payload missing a required field', { name: EVENT, payload: { userId: '1' } }],
        [
            'a payload with a value outside its enum',
            { name: EVENT, payload: { ...payload(1), reason: 'because' } }
        ]
    ])('retries %s, then parks it dead, and no consumer runs', async (_title, row) => {
        await withEnvironmentOverrides({ NODE_OUTBOX_MAX_ATTEMPTS: '2' }, async () => {
            subscribe();
            await outboxEventModel.create({
                ...row,
                aggregateId: 'agg-1',
                nextAttemptAt: new Date(0)
            });

            expect(await relayOutbox()).toMatchObject({ retried: 1, dead: 0 });
            await makeDue();
            expect(await relayOutbox()).toMatchObject({ retried: 0, dead: 1 });

            expect(await outboxEventModel.findOne().lean()).toMatchObject({
                status: 'dead',
                attempts: 2
            });
            expect(seen).toEqual([]);
        });
    });

    it('announces a parked event once, with its row id, name and aggregate', async () => {
        const announced: unknown[] = [];
        onDomainEvent(OUTBOX_EVENT_DEAD, (fact) => {
            announced.push(fact);
        });
        await withEnvironmentOverrides({ NODE_OUTBOX_MAX_ATTEMPTS: '2' }, async () => {
            subscribe(() => true);
            await write(1, 'agg-dead');

            await relayOutbox();
            expect(announced).toEqual([]);
            await makeDue();
            await relayOutbox();

            const row = await outboxEventModel.findOne().lean();
            expect(announced).toEqual([
                { eventId: String(row?._id), eventName: EVENT, aggregateId: 'agg-dead' }
            ]);
        });
    });

    it('counts each parked row once, for the alert on dead events', async () => {
        await withEnvironmentOverrides({ NODE_OUTBOX_MAX_ATTEMPTS: '1' }, async () => {
            subscribe(() => true);
            await write(1, 'agg-a');
            await write(2, 'agg-b');
            const before = await deadCounted();

            expect(await relayOutbox()).toMatchObject({ dead: 2 });

            expect(await deadCounted()).toBe(before + 2);
            // A second pass finds nothing left to park, so the counter stays put.
            await relayOutbox();
            expect(await deadCounted()).toBe(before + 2);
        });
    });

    it('does not let a dead event block the aggregate behind it', async () => {
        await withEnvironmentOverrides({ NODE_OUTBOX_MAX_ATTEMPTS: '1' }, async () => {
            subscribe((n) => n === 1);
            await write(1);
            await write(2);

            await relayOutbox();

            expect(seen.map(({ n }) => n)).toEqual([2]);
        });
    });

    it('delivers nothing where no module has subscribed, and keeps the row', async () => {
        resetDomainEvents();
        await write(1);

        expect(await relayOutbox()).toEqual({ published: 0, retried: 0, dead: 0 });
        expect(await outboxEventModel.findOne().lean()).toMatchObject({ status: 'pending' });
    });
});

describe('a relay that dies mid-dispatch', () => {
    it('does not let a second relay take a row whose claim is still live', async () => {
        subscribe();
        await write(1);
        // The first relay claimed the row and never finished: a live claim, no publish.
        await outboxEventModel.updateOne(
            {},
            { $set: { lockedUntil: new Date(Date.now() + 60_000) } }
        );

        expect(await relayOutbox()).toMatchObject({ published: 0 });
        expect(seen).toEqual([]);
    });

    it('re-delivers once the claim expires, with the SAME event id so a consumer can dedupe', async () => {
        subscribe();
        await write(1);
        await relayOutbox();
        const [first] = seen;
        // The publish landed but the process died before `markPublished`: the row is pending again.
        await outboxEventModel.updateOne(
            {},
            {
                $set: { status: 'pending', lockedUntil: new Date(Date.now() - 1000) },
                $unset: { publishedAt: 1 }
            }
        );

        await relayOutbox();

        expect(seen).toHaveLength(2);
        expect(seen[1].eventId).toBe(first.eventId);
    });

    it('two relays running together deliver each event once', async () => {
        subscribe();
        await Promise.all([write(1, 'a'), write(2, 'b'), write(3, 'c')]);

        await Promise.all([relayOutbox(), relayOutbox()]);

        expect(seen.map(({ n }) => n).toSorted()).toEqual([1, 2, 3]);
    });
});

describe('a relay whose lease was taken over mid-dispatch', () => {
    /** The token a peer relay holds after taking the row over. */
    const PEER_TOKEN = 'peer-relay-token';

    /** The lease expiry a peer relay holds after taking the row over. */
    const PEER_LOCKED_UNTIL = new Date(Date.now() + 60_000);

    /** Stand in for a peer taking the row over while this relay's consumer is still running. */
    const peerTakesOver = (): Promise<unknown> =>
        outboxEventModel
            .updateOne({}, { $set: { leaseToken: PEER_TOKEN, lockedUntil: PEER_LOCKED_UNTIL } })
            .exec();

    it('records no failure, no metric and no dead notice for a consumer that fails late', async () => {
        const announced: unknown[] = [];
        onDomainEvent(OUTBOX_EVENT_DEAD, (fact) => {
            announced.push(fact);
        });
        onDomainEvent(EVENT, () =>
            peerTakesOver().then(() => {
                throw new Error('consumer down');
            })
        );
        await write(1);

        expect(await relayOutbox()).toEqual({ published: 0, retried: 0, dead: 0 });

        expect(await outboxEventModel.findOne().lean()).toMatchObject({
            status: 'pending',
            attempts: 0,
            leaseToken: PEER_TOKEN,
            lockedUntil: PEER_LOCKED_UNTIL
        });
        expect(announced).toEqual([]);
    });

    it('parks nothing and announces nothing when the last attempt fails late', async () => {
        const announced: unknown[] = [];
        onDomainEvent(OUTBOX_EVENT_DEAD, (fact) => {
            announced.push(fact);
        });
        await withEnvironmentOverrides({ NODE_OUTBOX_MAX_ATTEMPTS: '1' }, async () => {
            onDomainEvent(EVENT, () =>
                peerTakesOver().then(() => {
                    throw new Error('consumer down');
                })
            );
            await write(1);

            expect(await relayOutbox()).toEqual({ published: 0, retried: 0, dead: 0 });
        });

        expect(await outboxEventModel.findOne().lean()).toMatchObject({
            status: 'pending',
            attempts: 0,
            leaseToken: PEER_TOKEN,
            lockedUntil: PEER_LOCKED_UNTIL
        });
        expect(announced).toEqual([]);
    });

    it('leaves the row pending under the peer when the consumer succeeds late', async () => {
        onDomainEvent(EVENT, () => peerTakesOver().then(() => undefined));
        await write(1);

        expect(await relayOutbox()).toEqual({ published: 0, retried: 0, dead: 0 });

        expect(await outboxEventModel.findOne().lean()).toMatchObject({
            status: 'pending',
            leaseToken: PEER_TOKEN,
            lockedUntil: PEER_LOCKED_UNTIL
        });
    });
});

/** A state change stand-in: one document in a collection the test can read back. */
const marks = (): Promise<number> => mongoose.connection.collection('marks').countDocuments();

/** The write: inserts a mark in the session, answers what it wrote. */
const insertMark = (session: ClientSession): Promise<{ n: number }> =>
    mongoose.connection
        .collection('marks')
        .insertOne({ n: 1 }, { session })
        .then(() => ({ n: 1 }));

/** The announcement for what the write returned. */
const announce = ({ n }: { n: number }) => ({
    name: EVENT,
    payload: payload(n),
    aggregateId: 'agg-1'
});

describe('announceInTransaction', () => {
    it('commits the change and its event together, then delivers the event', async () => {
        subscribe();

        const written = await announceInTransaction(insertMark, announce);
        await settleOutboxNudges();

        expect(written).toEqual({ n: 1 });
        expect(await marks()).toBe(1);
        expect(seen.map(({ n }) => n)).toEqual([1]);
    });

    it('writes no event when the conditional write matched nothing', async () => {
        const written = await announceInTransaction(() => Promise.resolve(null), announce);

        expect(written).toBeNull();
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });

    it('rolls the change back when the event cannot be written', async () => {
        await expect(
            announceInTransaction(insertMark, () => {
                throw new Error('cannot build the event');
            })
        ).rejects.toThrow('cannot build the event');

        expect(await marks()).toBe(0);
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });

    it('writes no event when the change itself fails', async () => {
        await expect(
            announceInTransaction(async (session) => {
                await insertMark(session);
                throw new Error('boom');
            }, announce)
        ).rejects.toThrow('boom');

        expect(await marks()).toBe(0);
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });
});

describe('announceInTransaction with several announcements', () => {
    it('writes one row per announcement, in order, and delivers them in order', async () => {
        subscribe();

        await announceInTransaction(insertMark, () => [
            { name: EVENT, payload: payload(1), aggregateId: 'agg-1' },
            { name: EVENT, payload: payload(2), aggregateId: 'agg-1' }
        ]);
        await settleOutboxNudges();

        expect(seen.map(({ n }) => n)).toEqual([1, 2]);
    });
});

describe('announceWithin', () => {
    it('joins the caller’s transaction: change and event commit together, and the caller wakes the relay', async () => {
        subscribe();

        await withTransaction((session) => announceWithin(session, insertMark, announce));
        expect(await outboxEventModel.countDocuments({ status: 'pending' })).toBe(1);
        expect(seen).toEqual([]);
        nudgeOutbox();
        await settleOutboxNudges();

        expect(await marks()).toBe(1);
        expect(seen.map(({ n }) => n)).toEqual([1]);
    });

    it('writes no event when the conditional write matched nothing', async () => {
        const written = await withTransaction((session) =>
            announceWithin(session, () => Promise.resolve(null), announce)
        );

        expect(written).toBeNull();
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });

    it('rolls the caller’s whole transaction back with a later failure', async () => {
        await expect(
            withTransaction(async (session) => {
                await announceWithin(session, insertMark, announce);
                throw new Error('a later write failed');
            })
        ).rejects.toThrow('a later write failed');

        expect(await marks()).toBe(0);
        expect(await outboxEventModel.countDocuments()).toBe(0);
    });
});

describe('nudgeOutbox', () => {
    it('publishes in the background and can be awaited', async () => {
        subscribe();
        await write(1);

        nudgeOutbox();
        await settleOutboxNudges();

        expect(seen).toHaveLength(1);
    });

    it('waits for a pass its own listener starts while it waits', async () => {
        onDomainEvent(EVENT, ({ userId }) => {
            const n = Number(userId);
            if (n === 2) {
                // Slow, so the second pass still holds its claim when the first one ends.
                return new Promise((resolve) => setTimeout(resolve, 50)).then(() => {
                    seen.push({ n });
                });
            }
            seen.push({ n });
            /**
             * The first delivery announces a second event, which starts a NEW pass mid-wait.
             * Stay busy while the new pass claims its row, so this pass ends before that one does.
             */
            return write(2, 'agg-2').then(() => {
                nudgeOutbox();
                return new Promise((resolve) => setTimeout(resolve, 30));
            });
        });
        await write(1);

        nudgeOutbox();
        await settleOutboxNudges();

        expect(seen.map(({ n }) => n)).toEqual([1, 2]);
    });
});

describe('cleanup', () => {
    it('declares a TTL on published rows only', () => {
        const indexes = outboxEventModel.schema.indexes();
        const ttl = indexes.filter(([, options]) => options.expireAfterSeconds !== undefined);

        expect(ttl.map(([fields]) => fields)).toEqual([{ publishedAt: 1 }]);
    });

    it('keeps a published row seven days by default', () => {
        const ttl = outboxEventModel.schema
            .indexes()
            .find(([, index]) => index.expireAfterSeconds !== undefined);

        expect(ttl?.[1].expireAfterSeconds).toBe(7 * 24 * 60 * 60);
    });
});
