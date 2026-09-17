import type { ZodType } from 'zod';
import { EmailJobPayloadSchema } from '@types';
import {
    isQueueEnabled,
    publishToQueue,
    consumeFromQueue,
    startQueue,
    stopQueue,
    DEAD_LETTER_EXCHANGE,
    deadLetterQueueOf
} from '@infrastructure/adapters/queue';

// ─── Mock amqplib ─────────────────────────────────────────────────────────────

const mockAck = jest.fn();
const mockNack = jest.fn();
const mockSendToQueue = jest.fn().mockReturnValue(true);
const mockAssertQueue = jest
    .fn()
    .mockResolvedValue({ queue: 'test', messageCount: 0, consumerCount: 0 });
const mockPrefetch = jest.fn().mockImplementation(() => Promise.resolve());
const mockConsume = jest.fn().mockResolvedValue({ consumerTag: 'tag-1' });
const mockAssertExchange = jest.fn().mockResolvedValue({ exchange: DEAD_LETTER_EXCHANGE });
const mockBindQueue = jest.fn().mockResolvedValue({});
const mockChannelOn = jest.fn();
const channelMock = () => ({
    assertQueue: mockAssertQueue,
    assertExchange: mockAssertExchange,
    bindQueue: mockBindQueue,
    sendToQueue: mockSendToQueue,
    prefetch: mockPrefetch,
    consume: mockConsume,
    ack: mockAck,
    nack: mockNack,
    on: mockChannelOn
});
const mockCreateChannel = jest.fn().mockImplementation(() => Promise.resolve(channelMock()));
const mockModelClose = jest.fn().mockImplementation(() => Promise.resolve());

/** Handlers `queue.ts` registered on the recovering connection's own events (`connect`/`disconnect`). */
let modelListeners: Record<string, ((...args: never[]) => void)[]> = {};
const mockModelOn = jest.fn((event: string, handler: (...args: never[]) => void): void => {
    (modelListeners[event] ??= []).push(handler);
});
/** Fires every handler `queue.ts` registered for one event — simulates the library emitting it. */
const emitModelEvent = (event: string, ...args: never[]) => {
    for (const handler of modelListeners[event] ?? []) handler(...args);
};
const recoveringModelMock = {
    createChannel: mockCreateChannel,
    on: mockModelOn,
    close: mockModelClose
};

/** The one thing `setup` reads off the model it is handed — same shape on every (re)connect. */
const fakeConnectionModel = { createChannel: mockCreateChannel };

/** The `setup` callback `queue.ts` passed to `{ recovery: { setup } }` on the one `connect()` call. */
let capturedSetup: ((model: unknown) => Promise<void>) | undefined;

/**
 * `amqplib.connect(url, { recovery: { setup } })`'s real contract, replayed exactly: `setup` is
 * awaited BEFORE this resolves, and this resolves only ONCE, on the first successful connect —
 * never again for a reconnect, which the library instead surfaces as `connect`/`disconnect`
 * events on the object this resolves to (see `simulateReconnect` below). `queue.ts` itself is
 * what is under test here, not a shortcut around amqplib's own documented shape.
 */
const mockConnect = jest
    .fn()
    .mockImplementation(
        async (
            _url: string,
            options: { recovery?: { setup?: (model: unknown) => Promise<void> } }
        ) => {
            modelListeners = {};
            capturedSetup = options.recovery?.setup;
            await capturedSetup?.(fakeConnectionModel);
            return recoveringModelMock;
        }
    );

jest.mock('amqplib', () => ({
    connect: (...args: unknown[]) => mockConnect(...args)
}));

/**
 * Simulates the library recovering from a drop: it re-runs `setup` on a fresh model (a new
 * channel, in this mock) and then emits `connect` — same order `node_modules/amqplib/lib/
 * recovery.js`'s `_connect()` uses, `setup` awaited before the event fires.
 */
const simulateReconnect = async () => {
    await capturedSetup?.(fakeConnectionModel);
    emitModelEvent('connect');
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const enableRabbitMQ = () => {
    process.env.NODE_RABBITMQ_URL = '******localhost:5672';
};

const disableRabbitMQ = () => {
    delete process.env.NODE_RABBITMQ_URL;
    delete process.env.NODE_RABBITMQ_HOST;
    delete process.env.NODE_RABBITMQ_PORT;
    delete process.env.NODE_RABBITMQ_USER;
    delete process.env.NODE_RABBITMQ_PASS;
    delete process.env.NODE_RABBITMQ_ENABLED;
};

/**
 * Enables the queue AND waits for its one connection to actually finish. `getChannel()`
 * deliberately never waits for one itself (rule 2, `queue.ts`'s own doc) — most cases below are
 * about what happens once a channel exists, so they need the wait this helper does instead.
 */
const ensureConnected = async () => {
    enableRabbitMQ();
    await stopQueue();
    await startQueue();
    await mockConnect.mock.results.at(-1)!.value;
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('isQueueEnabled()', () => {
    afterEach(disableRabbitMQ);

    it('returns false when no env vars are set', () => {
        disableRabbitMQ();
        expect(isQueueEnabled()).toBe(false);
    });

    it('returns true when NODE_RABBITMQ_URL is set', () => {
        enableRabbitMQ();
        expect(isQueueEnabled()).toBe(true);
    });

    it('returns true when HOST + PORT are set', () => {
        process.env.NODE_RABBITMQ_HOST = 'localhost';
        process.env.NODE_RABBITMQ_PORT = '5672';
        expect(isQueueEnabled()).toBe(true);
    });

    it('returns false when explicitly disabled', () => {
        enableRabbitMQ();
        process.env.NODE_RABBITMQ_ENABLED = '0';
        expect(isQueueEnabled()).toBe(false);
    });
});

describe('publishToQueue()', () => {
    afterEach(disableRabbitMQ);

    it('returns false when queue is not enabled', async () => {
        disableRabbitMQ();
        const result = await publishToQueue({ queue: 'test', payload: { foo: 'bar' } });
        expect(result).toBe(false);
    });

    it('publishes a message when enabled', async () => {
        await ensureConnected();
        const result = await publishToQueue({ queue: 'emails', payload: { to: 'a@b.c' } });
        expect(result).toBe(true);
        expect(mockSendToQueue).toHaveBeenCalledWith('emails', expect.any(Buffer), {
            persistent: true,
            priority: 0
        });
    });

    /**
     * A queue with no dead-letter policy turns the ack policy's "handled and declined" arm into
     * deletion: `nack(msg, false, false)` on a queue that dead-letters nowhere destroys the
     * message. The three declarations below are what make `false` a decision rather than a loss,
     * and the binding has to exist before the work queue names the exchange.
     */
    it('declares the work queue pointing at a bound dead-letter queue', async () => {
        await ensureConnected();
        await publishToQueue({ queue: 'emails', payload: { to: 'a@b.c' } });

        expect(mockAssertExchange).toHaveBeenCalledWith(DEAD_LETTER_EXCHANGE, 'direct', {
            durable: true
        });
        expect(mockAssertQueue).toHaveBeenCalledWith(deadLetterQueueOf('emails'), {
            durable: true
        });
        expect(mockBindQueue).toHaveBeenCalledWith(
            deadLetterQueueOf('emails'),
            DEAD_LETTER_EXCHANGE,
            deadLetterQueueOf('emails')
        );
        expect(mockAssertQueue).toHaveBeenCalledWith('emails', {
            durable: true,
            deadLetterExchange: DEAD_LETTER_EXCHANGE,
            deadLetterRoutingKey: deadLetterQueueOf('emails'),
            arguments: { 'x-max-priority': 1 }
        });
    });

    /**
     * The declared contract is a boolean, and `false` is what `enqueueEmail` reads to send the
     * mail inline instead. A rejection is not `false`: it skips that fallback entirely and lands
     * on a caller that wrote `void enqueueEmail(...)`, so the email is neither queued nor sent
     * and the only trace is an `unhandledRejection` with no request id attached.
     */
    it('answers false when the channel dies mid-publish, rather than rejecting', async () => {
        await ensureConnected();
        mockAssertExchange.mockRejectedValueOnce(new Error('Channel closed'));

        await expect(publishToQueue({ queue: 'emails', payload: { to: 'a@b.c' } })).resolves.toBe(
            false
        );
    });
});

describe('the channel is supervised, not only the connection', () => {
    afterEach(disableRabbitMQ);

    /**
     * In amqplib a `Channel` is an EventEmitter in its own right. The broker closes one on
     * ordinary faults — a `PRECONDITION_FAILED` from re-declaring a queue with new arguments is
     * the common one — and leaves the connection open, so the connection's listeners never fire.
     * With no `error` listener the emit is an uncaught exception; with no `close` listener the
     * cached handle stays set and every later publish reaches a corpse while
     * `GET /observability/health` still reports `queue: "ready"`.
     */
    it('registers error and close listeners on the channel', async () => {
        mockChannelOn.mockClear();

        await ensureConnected();

        expect(mockChannelOn.mock.calls.map(([event]) => event)).toEqual(
            expect.arrayContaining(['error', 'close'])
        );
    });
});

describe('consumeFromQueue()', () => {
    afterEach(disableRabbitMQ);

    it('does nothing when queue is not enabled', async () => {
        disableRabbitMQ();
        const handler = jest.fn().mockResolvedValue(true);
        await consumeFromQueue({ queue: 'test', handler });
        expect(mockConsume).not.toHaveBeenCalled();
    });

    it('registers a consumer once the connection is ready', async () => {
        await ensureConnected();

        const handler = jest.fn().mockResolvedValue(true);
        await consumeFromQueue({ queue: 'pdfs', handler });

        expect(mockAssertQueue).toHaveBeenCalledWith('pdfs', {
            durable: true,
            deadLetterExchange: DEAD_LETTER_EXCHANGE,
            deadLetterRoutingKey: deadLetterQueueOf('pdfs'),
            arguments: { 'x-max-priority': 1 }
        });
        expect(mockPrefetch).toHaveBeenCalledWith(1);
        expect(mockConsume).toHaveBeenCalled();
    });

    it('records the registration but binds nothing yet while still connecting', async () => {
        enableRabbitMQ();
        await stopQueue();
        // Stands in for a broker that has not answered yet — deterministic, unlike racing
        // `consumeFromQueue`'s own resolution against how many microtask ticks the mocked
        // connect+setup chain happens to need.
        mockConnect.mockImplementationOnce(() => new Promise(() => undefined));
        mockConsume.mockClear();
        const handler = jest.fn().mockResolvedValue(true);

        // `getChannel()` kicks off the connection but never waits on it (rule 2), so a caller
        // that reaches `consumeFromQueue` before it settles gets a resolved promise with nothing
        // bound — the pending connect above is what guarantees that stays true through the assertion.
        await consumeFromQueue({ queue: 'still-connecting', handler });

        expect(mockConsume).not.toHaveBeenCalled();
    });
});

describe('startQueue() / stopQueue()', () => {
    afterEach(disableRabbitMQ);

    it('startQueue resolves without error when disabled', async () => {
        disableRabbitMQ();
        await expect(startQueue()).resolves.toBeUndefined();
    });

    it('stopQueue resolves without error when not connected', async () => {
        disableRabbitMQ();
        await expect(stopQueue()).resolves.toBeUndefined();
    });
});

// ─── The acknowledgement policy ──────────────────────────────────────────────
/**
 * What happens to a message after the handler has run — the part of this adapter that decides
 * whether a failed job is retried, discarded, or spins forever. None of it was executed by any
 * test: the cases above stop at "a consumer was registered" and never invoke the callback that
 * registration installs.
 *
 * The policy has four arms, and the two `nack` arguments are what separate them:
 * `nack(message, allUpTo, requeue)`.
 *
 * | outcome                | call                      | effect                              |
 * | ---------------------- | ------------------------- | ----------------------------------- |
 * | handler resolves true  | `ack`                     | broker deletes it — done            |
 * | handler resolves false | `nack(msg, false, false)` | refused on purpose, discard         |
 * | handler throws         | `nack(msg, false, true)`  | presumed transient, try again       |
 * | message will not parse | `nack(msg, false, false)` | discard — requeueing loops forever  |
 *
 * The last row is the one worth testing hardest. Requeueing a message whose bytes will never
 * become valid JSON puts the consumer in a hot loop against the broker, and `requeue` is a
 * single boolean that no other assertion looks at.
 */
/** Register a consumer and hand back the callback the broker would invoke per delivery. */
const captureConsumerCallback = async (handler: jest.Mock, schema?: ZodType) => {
    mockAssertQueue.mockResolvedValue({ queue: 'jobs', messageCount: 0, consumerCount: 0 });
    mockPrefetch.mockImplementation(() => Promise.resolve());
    mockConsume.mockResolvedValue({ consumerTag: 'tag-1' });
    mockCreateChannel.mockImplementation(() => Promise.resolve(channelMock()));

    // `consumeFromQueue` only RECORDS a binding while still connecting (rule 2) — every case
    // below needs the real `ch.consume()` call to capture its delivery callback, so the
    // connection is established first, regardless of what an earlier test left it as.
    await ensureConnected();
    // A prior test's own registrations replay onto this fresh channel too (`consumerBindings` is
    // module-level and this file never resets it) — cleared so `.mock.calls[0]` below is this
    // call's own registration, not one of theirs.
    mockConsume.mockClear();

    await consumeFromQueue({ queue: 'jobs', handler, schema });

    return mockConsume.mock.calls[0]![1] as (
        message: { content: Buffer } | undefined
    ) => void | Promise<void>;
};

/** A delivery carrying the given body, serialized the way `publishToQueue` writes it. */
const delivery = (body: unknown) => ({ content: Buffer.from(JSON.stringify(body)) });

describe('consumeFromQueue acknowledgement policy', () => {
    afterEach(disableRabbitMQ);

    it('acks when the handler reports success', async () => {
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler);

        await onMessage(delivery({ jobId: 1 }));
        await Promise.resolve();

        expect(mockAck).toHaveBeenCalledTimes(1);
        expect(mockNack).not.toHaveBeenCalled();
    });

    it('hands the handler the parsed body, not the raw buffer', async () => {
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler);

        await onMessage(delivery({ jobId: 7, to: 'a@example.com' }));

        expect(handler).toHaveBeenCalledWith(
            { jobId: 7, to: 'a@example.com' },
            expect.objectContaining({ content: expect.anything() })
        );
    });

    it('discards without requeueing when the handler refuses the message', async () => {
        // A business rejection: the job was understood and declined. Requeueing it would ask the
        // same question again and get the same answer, forever.
        const handler = jest.fn().mockResolvedValue(false);
        const onMessage = await captureConsumerCallback(handler);

        await onMessage(delivery({ jobId: 2 }));
        await Promise.resolve();

        expect(mockAck).not.toHaveBeenCalled();
        expect(mockNack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('requeues when the handler throws, because a thrown error is presumed transient', async () => {
        // The distinction from the case above is the third argument, and it is the difference
        // between "this email will be sent when SMTP comes back" and "this email is lost".
        const handler = jest.fn().mockRejectedValue(new Error('SMTP timeout'));
        const onMessage = await captureConsumerCallback(handler);

        await onMessage(delivery({ jobId: 3 }));
        await Promise.resolve();

        expect(mockNack).toHaveBeenCalledWith(expect.anything(), false, true);
    });

    it('discards a message that will never parse, rather than requeueing it forever', async () => {
        // The poison-message case. These bytes are not JSON and never will be, so requeueing
        // hands the same delivery straight back and the consumer spins against the broker at
        // full speed. `requeue: false` is the only thing standing between this adapter and that
        // loop, and nothing else in the suite reads it.
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler);

        await onMessage({ content: Buffer.from('{ not json') });

        expect(handler).not.toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
        expect(mockNack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('ignores a broker-side cancellation, which delivers null', async () => {
        // Sent when the queue is deleted or the channel is closing. There is no delivery to ack,
        // and acking `null` is an error rather than a no-op.
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler);

        await onMessage(undefined);

        expect(handler).not.toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
        expect(mockNack).not.toHaveBeenCalled();
    });
});

/**
 * Contract validation on the consuming side.
 *
 * A queue payload crosses a process boundary, and that is exactly where its TypeScript type stops
 * being a fact: the broker delivers whatever was published, by whoever published it. The schema is
 * generated from `asyncapi.yaml`, so this is the contract enforced rather than a second copy of it.
 *
 * The failure arm matters as much as the passing one — a message that does not match will not
 * start matching on a retry, so it must dead-letter rather than requeue.
 */
describe('consumeFromQueue contract validation', () => {
    afterEach(disableRabbitMQ);

    it('runs the handler when the payload matches the contract', async () => {
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler, EmailJobPayloadSchema);

        await onMessage(
            delivery({ request: { to: 'a@example.com' }, templateName: 'account.reset', data: {} })
        );
        await Promise.resolve();

        expect(handler).toHaveBeenCalledTimes(1);
        expect(mockAck).toHaveBeenCalledTimes(1);
    });

    it('never reaches the handler when a required field is missing', async () => {
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler, EmailJobPayloadSchema);

        // No `templateName`: the worker would have refused this too, but only after the payload
        // had already reached code that trusts it.
        await onMessage(delivery({ request: { to: 'a@example.com' }, data: {} }));
        await Promise.resolve();

        expect(handler).not.toHaveBeenCalled();
        expect(mockNack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('rejects a field the contract does not declare, rather than passing it through', async () => {
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler, EmailJobPayloadSchema);

        // `additionalProperties: false` in the contract becomes `.strict()` in the generated
        // schema. Without it a producer could smuggle a field the consumer's own type never
        // mentions, which is the whole shape of a message-injection bug.
        await onMessage(
            delivery({
                request: { to: 'a@example.com', bcc: 'attacker@example.com' },
                templateName: 'account.reset',
                data: {}
            })
        );
        await Promise.resolve();

        expect(handler).not.toHaveBeenCalled();
        expect(mockNack).toHaveBeenCalledWith(expect.anything(), false, false);
    });

    it('still delivers when no schema is declared, so an unvalidated queue keeps working', async () => {
        const handler = jest.fn().mockResolvedValue(true);
        const onMessage = await captureConsumerCallback(handler);

        await onMessage(delivery({ anything: 'at all' }));
        await Promise.resolve();

        expect(handler).toHaveBeenCalledTimes(1);
    });
});

/**
 * "Consumers never come back": amqplib's recovery re-runs `setup` after every successful
 * (re)connect, and `setup` (`setupChannel` in `queue.ts`) is what re-binds every known consumer —
 * without that replay, a fresh channel from a reconnect starts with none of its own.
 */
describe('a reconnect gets its consumers back', () => {
    afterEach(disableRabbitMQ);

    it('re-binds a known consumer onto the reconnect channel, which then consumes a job', async () => {
        await ensureConnected();

        const handler = jest.fn().mockResolvedValue(true);
        await consumeFromQueue({ queue: 'reconnect-jobs', handler });
        expect(mockConsume).toHaveBeenCalledWith('reconnect-jobs', expect.any(Function));

        // The broker drops and the library reconnects on its own — `setup` runs again on a fresh
        // model (`mockCreateChannel` standing in for the fresh channel it opens), THEN `connect`
        // fires, same order `node_modules/amqplib/lib/recovery.js`'s `_connect()` uses.
        mockConsume.mockClear();
        mockCreateChannel.mockClear();
        await simulateReconnect();

        expect(mockCreateChannel).toHaveBeenCalledTimes(1);
        const rebound = mockConsume.mock.calls.find(([queue]) => queue === 'reconnect-jobs');
        expect(rebound).toBeDefined();

        const onMessage = rebound![1] as (message: unknown) => void | Promise<void>;
        await onMessage(delivery({ jobId: 'after-reconnect' }));
        await Promise.resolve();

        expect(handler).toHaveBeenCalledWith({ jobId: 'after-reconnect' }, expect.anything());
        expect(mockAck).toHaveBeenCalledTimes(1);
    });
});

/**
 * Rule 1 (`queue.ts`'s own doc, from `docs/tools/rabbitmq.md`): don't wait for RabbitMQ at boot.
 * With recovery on, amqplib's own `connect()` promise settles only once the broker actually
 * answers, retrying forever underneath — so `startQueue` must never await it, or a broker that is
 * merely still starting would stop the app booting at all.
 */
describe('startQueue() never waits for the broker', () => {
    afterEach(disableRabbitMQ);

    it('resolves even while the connection is still pending', async () => {
        enableRabbitMQ();
        await stopQueue();
        // Stands in for a broker that never answers: this one connect attempt never settles, so
        // if `startQueue` ever awaited it — even transitively — this test would time out rather
        // than resolve.
        mockConnect.mockImplementationOnce(() => new Promise(() => undefined));

        await expect(startQueue()).resolves.toBeUndefined();
    });
});
