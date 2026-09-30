import { setupTestDb } from '@tests/setup-test-db';
import { withEnvironment } from '@tests/environment';
import { withTransaction } from '@infrastructure/runtime/database';
import {
    markDomainEventsWired,
    onDomainEvent,
    resetDomainEvents,
    type DomainEventMeta
} from '@kernel/events';
import {
    enqueueOutboxEvent,
    nudgeOutbox,
    outboxEventModel,
    relayOutbox,
    settleOutboxNudges
} from '@kernel/outbox';

/**
 * The transactional outbox against a real replica-set Mongo: the row commits or aborts with the
 * caller's own transaction, the relay delivers it at-least-once and in order per aggregate, a
 * failing consumer is retried and finally parked, and a relay that died mid-dispatch is recovered
 * without losing the event. See docs/tools/outbox.md.
 */

setupTestDb();

declare module '@kernel/events' {
    interface DomainEventMap {
        'test.outbox': { n: number };
    }
}

/** Every delivery a subscriber saw: the payload's `n` and the stable event id. */
let seen: { n: number; eventId?: string }[];

/** Record every delivery, and optionally throw for the ones `failWhen` names. */
const subscribe = (failWhen: (n: number) => boolean = () => false): void => {
    onDomainEvent('test.outbox', ({ n }, meta: DomainEventMeta) => {
        if (failWhen(n)) throw new Error('consumer down');
        seen.push({ n, eventId: meta.eventId });
    });
};

/** Write one event in its own committed transaction. */
const write = (n: number, aggregateId = 'agg-1'): Promise<void> =>
    withTransaction((session) => enqueueOutboxEvent('test.outbox', { n }, aggregateId, session));

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
                await enqueueOutboxEvent('test.outbox', { n: 1 }, 'agg-1', session);
                throw new Error('the state change failed');
            })
        ).rejects.toThrow('the state change failed');

        expect(await outboxEventModel.countDocuments()).toBe(0);
    });

    it('is invisible to a reader until the transaction commits', async () => {
        let countInside = -1;

        await withTransaction(async (session) => {
            await enqueueOutboxEvent('test.outbox', { n: 1 }, 'agg-1', session);
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
        await withEnvironment('NODE_OUTBOX_MAX_ATTEMPTS', '2', async () => {
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

    it('does not let a dead event block the aggregate behind it', async () => {
        await withEnvironment('NODE_OUTBOX_MAX_ATTEMPTS', '1', async () => {
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

describe('nudgeOutbox', () => {
    it('publishes in the background and can be awaited', async () => {
        subscribe();
        await write(1);

        nudgeOutbox();
        await settleOutboxNudges();

        expect(seen).toHaveLength(1);
    });
});

describe('cleanup', () => {
    it('declares a TTL on published rows only', () => {
        const indexes = outboxEventModel.schema.indexes();
        const ttl = indexes.filter(([, options]) => options.expireAfterSeconds !== undefined);

        expect(ttl.map(([fields]) => fields)).toEqual([{ publishedAt: 1 }]);
    });
});
