/**
 * The queue adapter against a REAL RabbitMQ.
 *
 * `tests/unit/infrastructure/adapters/queue.test.ts` mocks `amqplib`, so it proves the arguments
 * `queue.ts` hands over and never what the broker does with them. Each case here is one only a
 * broker can answer: does the topology declare on the version we run, does a retry republish
 * carry the `x-retry-attempt` header `attemptsOf` reads, where does a message actually go once a delivery limit is spent.
 *
 * ── What is left out, on purpose ──────────────────────────────────────────────────────────────
 * The webhook path through the broker (the live e2e and `webhooks/tests/integration/delivery.test.ts`
 * cover it) and publish-confirm refusal/timeout (a broker cannot be made to refuse on demand
 * without testing RabbitMQ itself; the unit suite covers our branch).
 *
 * Needs a broker and a management plugin: see `./support/rabbitmq.ts`, and
 * `docs/tools/broker-testing.md` for the shape of the whole suite.
 */

import { z } from 'zod';
import amqplib, { type Channel, type ChannelModel, type ConsumeMessage } from 'amqplib';
import { withEnvironmentOverrides } from '@tests/environment';
import { startRabbitMq, type TestRabbitMq } from './support/rabbitmq';

/** The adapter under test, as a fresh copy of its module (each copy owns one connection). */
/** A schema that accepts any JSON — these cases are about delivery, not the contract. */
const anyPayload = z.unknown();

type QueueAdapter = typeof import('@infrastructure/adapters/queue');

/** Short knobs: a retry that takes seconds, and two attempts, keep each case under a few seconds. */
const RETRY_DELAY_SECONDS = 1;
const MAX_ATTEMPTS = 2;

/** The broker's own delivery limit on a work queue (`QUORUM_DELIVERY_LIMIT` in `queue.ts`). */
const DELIVERY_LIMIT = 3;

/** Real TTLs and a container image pull are slower than jest's default. */
jest.setTimeout(120_000);

let broker: TestRabbitMq;

/** Adapter copies and raw connections a case opened; closed after it, whatever it asserted. */
const adapters: QueueAdapter[] = [];
const connections: ChannelModel[] = [];

beforeAll(() =>
    startRabbitMq().then((started) => {
        broker = started;
    })
);

afterAll(() => broker.stop());

afterEach(() => {
    inspector = undefined;
    return (
        Promise.all(adapters.splice(0).map((adapter) => adapter.stopQueue()))
            .then(() => Promise.all(connections.splice(0).map((connection) => connection.close())))
            .then(() => undefined)
            // A connection a case already dropped has nothing left to close.
            .catch(() => undefined)
    );
});

/** The channel `depth` reads through, opened on first use and dropped with the case's connections. */
let inspector: Promise<Channel> | undefined;

/** A queue name no other case uses, so one case's leftovers never reach the next. */
const uniqueQueue = (): string => `broker-test.${Math.random().toString(36).slice(2, 10)}`;

/** Resolves once `check` is truthy, polling; rejects after `timeoutMs` with `what` in the message. */
const waitUntil = (
    check: () => boolean | Promise<boolean>,
    what: string,
    timeoutMs = 15_000
): Promise<void> => {
    const deadline = Date.now() + timeoutMs;

    const poll = (): Promise<void> =>
        Promise.resolve(check()).then((done) => {
            if (done) return;
            if (Date.now() > deadline) throw new Error(`Timed out waiting for ${what}`);
            return new Promise<void>((resolve) => setTimeout(resolve, 100)).then(poll);
        });

    return poll();
};

/** Resolves after `ms` — for asserting that something does NOT happen. */
const quiet = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs a case with the adapter pointed at the broker and the short retry knobs set.
 *
 * @param body - the case; the environment is restored when it settles
 * @param extra - further variables, for the case that needs more than the shared ones
 */
const inBrokerEnvironment = (body: () => Promise<void>, extra: Record<string, string> = {}) =>
    withEnvironmentOverrides(
        {
            NODE_RABBITMQ_URL: broker.url,
            NODE_QUEUE_RETRY_DELAY_SECONDS: String(RETRY_DELAY_SECONDS),
            NODE_QUEUE_MAX_ATTEMPTS: String(MAX_ATTEMPTS),
            ...extra
        },
        body
    );

/**
 * A fresh copy of the adapter that has finished connecting, which is what a process is after boot.
 *
 * `jest.resetModules()` because the adapter keeps its channel in module state: two copies are two
 * processes, which is what the idempotent-declare case needs and what a reconnect case must not
 * share with its neighbours.
 *
 * @param environment - set while the module loads, for what the adapter captures at import time
 */
const bootAdapter = (environment: Record<string, string> = {}): Promise<QueueAdapter> =>
    withEnvironmentOverrides(environment, () => {
        jest.resetModules();
        return import('@infrastructure/adapters/queue');
    }).then((adapter) => {
        adapters.push(adapter);
        return adapter
            .startQueue()
            .then(() =>
                waitUntil(() => adapter.queueState() === 'ready', 'the adapter to connect').then(
                    () => adapter
                )
            );
    });

/** A raw amqplib channel on the run's vhost — a stand-in for anything that is not the adapter. */
const rawChannel = (): Promise<Channel> =>
    amqplib.connect(broker.url).then((connection) => {
        connections.push(connection);
        return connection.createChannel();
    });

/**
 * Messages sitting ready in a queue, read live (a passive declare, not the management API, whose
 * counters lag by its stats interval).
 *
 * @param name - the queue
 */
const depth = (name: string): Promise<number> =>
    (inspector ??= rawChannel()).then((channel) =>
        channel.checkQueue(name).then((ok) => ok.messageCount)
    );

/** One delivery a handler saw. */
interface Seen {
    payload: unknown;
    raw: ConsumeMessage;
    at: number;
}

/**
 * A handler that records every delivery and answers with `decide`.
 *
 * @param decide - what to do with the Nth call (0-based); resolve true to ack, false to park, throw to retry
 */
const recorder = (decide: (call: number) => Promise<boolean> = () => Promise.resolve(true)) => {
    const seen: Seen[] = [];
    return {
        seen,
        handler: (payload: unknown, raw: ConsumeMessage): Promise<boolean> => {
            seen.push({ payload, raw, at: Date.now() });
            return decide(seen.length - 1);
        }
    };
};

/**
 * Takes one delivery and dies without acking it: the channel closes, and the broker returns the
 * message to the queue with its delivery count one higher. What a crashed worker looks like.
 *
 * @param queue - the work queue
 * @returns the delivery the "worker" held when it died
 */
const crashOnce = (queue: string): Promise<ConsumeMessage> =>
    rawChannel().then(
        (channel) =>
            new Promise<ConsumeMessage>((resolve, reject) => {
                // `consume(queue, onMessage)`: no `noAck`, so the delivery stays unacknowledged.
                // https://amqp-node.github.io/amqplib/channel_api.html#channel_consume
                channel
                    .consume(queue, (message) => {
                        if (!message) return;
                        channel
                            .close()
                            .then(() => resolve(message))
                            .catch(reject);
                    })
                    .catch(reject);
            })
    );

/** Crashes `times` deliveries in a row, returning each one's `x-delivery-count` header. */
const crashRepeatedly = async (queue: string, times: number): Promise<number[]> => {
    const counts: number[] = [];
    for (let crash = 0; crash < times; crash += 1) {
        const message = await crashOnce(queue);
        counts.push(Number(message.properties.headers?.['x-delivery-count'] ?? 0));
    }
    return counts;
};

describe('the topology on a real broker', () => {
    it('declares quorum queues with the retry arguments, and a second declare is accepted', () =>
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const first = await bootAdapter();
            const second = await bootAdapter();
            const { handler, seen } = recorder();

            expect(await first.publishToQueue({ queue, payload: { n: 1 } })).toBe(true);
            // The second copy declares the same queue again: a differing argument would answer
            // PRECONDITION_FAILED and close its channel, so a delivery proves the re-declare took.
            await second.consumeFromQueue({ queue, handler, schema: anyPayload });
            await waitUntil(() => seen.length === 1, 'the second copy to receive the job');

            const work = await broker.management.queue(queue);
            const retry = await broker.management.queue(`${queue}.retry`);
            const dead = await broker.management.queue(`${queue}.dead`);

            expect(work.type).toBe('quorum');
            expect(work.arguments).toMatchObject({
                'x-delivery-limit': DELIVERY_LIMIT,
                'x-dead-letter-strategy': 'at-least-once',
                'x-overflow': 'reject-publish',
                'x-dead-letter-exchange': 'dead-letter',
                'x-dead-letter-routing-key': `${queue}.dead`
            });
            expect(retry.type).toBe('quorum');
            expect(retry.arguments).toMatchObject({
                'x-message-ttl': RETRY_DELAY_SECONDS * 1000,
                'x-dead-letter-strategy': 'at-least-once',
                'x-overflow': 'reject-publish',
                'x-dead-letter-exchange': 'dead-letter',
                'x-dead-letter-routing-key': queue
            });
            expect(dead.type).toBe('quorum');
        }));
});

describe('retry and parking', () => {
    it('gives a throwing handler its job back after the TTL, with the attempt counted in x-retry-attempt', () =>
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const adapter = await bootAdapter();
            const { handler, seen } = recorder((call) =>
                call === 0 ? Promise.reject(new Error('transient')) : Promise.resolve(true)
            );

            await adapter.consumeFromQueue({ queue, handler, schema: anyPayload });
            await adapter.publishToQueue({ queue, payload: { job: 'retry-me' } });
            await waitUntil(() => seen.length === 2, 'the redelivery');

            const [first, second] = seen;
            expect(first?.payload).toEqual({ job: 'retry-me' });
            expect(first?.raw.properties.headers?.['x-retry-attempt']).toBeUndefined();
            // What `attemptsOf` reads: our own header, stamped by the retry republish.
            expect(second.raw.properties.headers?.['x-retry-attempt']).toBe(1);
            expect(second.at - first.at).toBeGreaterThanOrEqual(RETRY_DELAY_SECONDS * 900);
            expect(await depth(`${queue}.dead`)).toBe(0);
        }));

    it('parks a job in <queue>.dead once its attempts are spent, and parkedCounts reports it', () =>
        inBrokerEnvironment(async () => {
            const adapter = await bootAdapter();
            // `parkedCounts` reads the contract's worker queues only, so this one case uses a real one.
            const queue = adapter.EMAIL_QUEUE;
            const { handler, seen } = recorder(() => Promise.reject(new Error('always')));

            await adapter.consumeFromQueue({ queue, handler, schema: anyPayload });
            await adapter.publishToQueue({ queue, payload: { job: 'doomed' } });
            await waitUntil(
                async () => (await depth(adapter.deadLetterQueueOf(queue))) === 1,
                'the job to be parked'
            );

            expect(seen).toHaveLength(MAX_ATTEMPTS);
            expect(await adapter.parkedCounts()).toContainEqual({ name: queue, parked: 1 });
            // Parked byte for byte, and nothing left to retry.
            const channel = await rawChannel();
            const parked = await channel.get(adapter.deadLetterQueueOf(queue), { noAck: true });
            expect(parked && JSON.parse(parked.content.toString())).toEqual({ job: 'doomed' });
            expect(await depth(adapter.retryQueueOf(queue))).toBe(0);
            expect(await depth(queue)).toBe(0);
        }));

    it('parks a job whose handler answers false at once, without a retry', () =>
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const adapter = await bootAdapter();
            const { handler, seen } = recorder(() => Promise.resolve(false));

            await adapter.consumeFromQueue({ queue, handler, schema: anyPayload });
            await adapter.publishToQueue({ queue, payload: { job: 'refused' } });
            await waitUntil(
                async () => (await depth(adapter.deadLetterQueueOf(queue))) === 1,
                'the job to be parked'
            );
            // Longer than the retry TTL: a retry would show as a second call by now.
            await quiet(RETRY_DELAY_SECONDS * 2000);

            expect(seen).toHaveLength(1);
            expect(await depth(adapter.retryQueueOf(queue))).toBe(0);
        }));
});

describe('a consumer that dies without answering', () => {
    it('gets the job back with a higher x-delivery-count, and processes it', () =>
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const adapter = await bootAdapter();
            await adapter.publishToQueue({ queue, payload: { job: 'survivor' } });

            // Under the limit: two crashes leave the message on the work queue.
            expect(await crashRepeatedly(queue, 2)).toEqual([0, 1]);

            const { handler, seen } = recorder();
            await adapter.consumeFromQueue({ queue, handler, schema: anyPayload });
            await waitUntil(() => seen.length === 1, 'the survivor to be processed');

            expect(seen[0]?.raw.properties.headers?.['x-delivery-count']).toBe(2);
            expect(await depth(adapter.deadLetterQueueOf(queue))).toBe(0);
        }));

    /*
     * `x-delivery-limit` dead-letters the job straight to `<queue>.dead` (reason `delivery_limit`),
     * so a job that kills its consumer on contact is parked, never dropped.
     */
    it('parks a job whose consumer died past x-delivery-limit', () =>
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const adapter = await bootAdapter();
            await adapter.publishToQueue({ queue, payload: { job: 'poison' } });

            // The first delivery plus DELIVERY_LIMIT redeliveries, each one dying unanswered.
            const counts = await crashRepeatedly(queue, DELIVERY_LIMIT + 1);
            expect(counts).toEqual([0, 1, 2, 3]);

            await waitUntil(
                async () => (await depth(adapter.deadLetterQueueOf(queue))) === 1,
                'the job to be parked'
            );

            const channel = await rawChannel();
            const parked = await channel.get(adapter.deadLetterQueueOf(queue), { noAck: true });
            // The broker's own header: one entry per queue the message was dead-lettered from.
            const deaths = (parked ? parked.properties.headers?.['x-death'] : []) as {
                reason: string;
            }[];
            expect(deaths[0]?.reason).toBe('delivery_limit');
            expect(await depth(queue)).toBe(0);
            expect(await depth(adapter.retryQueueOf(queue))).toBe(0);
        }));
});

describe('delivery order and flow control', () => {
    it('delivers a high-priority job before the normal ones waiting ahead of it', () =>
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const adapter = await bootAdapter();
            // Published with no consumer, so all four are waiting when the first delivery is chosen.
            for (const label of ['normal-1', 'normal-2', 'normal-3']) {
                expect(await adapter.publishToQueue({ queue, payload: { label } })).toBe(true);
            }
            expect(
                await adapter.publishToQueue({
                    queue,
                    payload: { label: 'high' },
                    priority: 'high'
                })
            ).toBe(true);

            const { handler, seen } = recorder();
            await adapter.consumeFromQueue({ queue, handler, schema: anyPayload });
            await waitUntil(() => seen.length === 4, 'all four jobs');

            expect(seen.map(({ payload }) => (payload as { label: string }).label)).toEqual([
                'high',
                'normal-1',
                'normal-2',
                'normal-3'
            ]);
        }));

    it.each([1, 2])('hands a consumer at most `prefetch` unacknowledged jobs (%d)', (prefetch) =>
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const adapter = await bootAdapter();
            // The handler stays mid-flight until the case opens the gate.
            let gateOpen = false;
            const { handler, seen } = recorder(() =>
                waitUntil(() => gateOpen, 'the gate').then(() => true)
            );

            await adapter.consumeFromQueue({ queue, handler, schema: anyPayload, prefetch });
            for (const n of [1, 2, 3]) await adapter.publishToQueue({ queue, payload: { n } });
            await waitUntil(() => seen.length === prefetch, 'the first deliveries');
            // Long enough for a third delivery to arrive if the limit were not applied.
            await quiet(500);

            expect(seen).toHaveLength(prefetch);
            expect(await depth(queue)).toBe(3 - prefetch);

            gateOpen = true;
            await waitUntil(() => seen.length === 3, 'the rest, once the first are acked');
        })
    );
});

describe('a connection dropped by the broker', () => {
    it('is recovered: the consumer is re-bound and jobs flow again', () =>
        // `NODE_ENV` outside `test` for the module load: under `test` the adapter's recovery gets
        // `maxRetries: 0` (`RECOVERY_OPTIONS`) so a broker that never answers cannot hang jest, and
        // that is precisely the behaviour this case must not run under.
        inBrokerEnvironment(async () => {
            const queue = uniqueQueue();
            const adapter = await bootAdapter({ NODE_ENV: 'development' });
            const { handler, seen } = recorder();

            await adapter.consumeFromQueue({ queue, handler, schema: anyPayload });
            expect(await adapter.publishToQueue({ queue, payload: { n: 1 } })).toBe(true);
            await waitUntil(() => seen.length === 1, 'the first job');

            expect(await broker.management.dropConnections()).toBeGreaterThanOrEqual(1);

            // `publishToQueue` answers false while there is no channel, which is the signal to keep trying.
            await waitUntil(
                () => adapter.publishToQueue({ queue, payload: { n: 2 } }),
                'a publish to be confirmed on the recovered connection',
                30_000
            );
            await waitUntil(() => seen.length >= 2, 'the re-bound consumer to receive it');

            expect(adapter.queueState()).toBe('ready');
            expect(seen.map(({ payload }) => payload)).toContainEqual({ n: 2 });
        }));
});
