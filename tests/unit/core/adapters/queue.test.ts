import {
    isQueueEnabled,
    publishToQueue,
    consumeFromQueue,
    startQueue,
    stopQueue
} from '@core/adapters/queue';

// ─── Mock amqplib ─────────────────────────────────────────────────────────────

const mockAck = jest.fn();
const mockNack = jest.fn();
const mockSendToQueue = jest.fn().mockReturnValue(true);
const mockAssertQueue = jest
    .fn()
    .mockResolvedValue({ queue: 'test', messageCount: 0, consumerCount: 0 });
const mockPrefetch = jest.fn().mockImplementation(() => Promise.resolve());
const mockConsume = jest.fn().mockResolvedValue({ consumerTag: 'tag-1' });
const mockCreateChannel = jest.fn().mockResolvedValue({
    assertQueue: mockAssertQueue,
    sendToQueue: mockSendToQueue,
    prefetch: mockPrefetch,
    consume: mockConsume,
    ack: mockAck,
    nack: mockNack
});
const mockClose = jest.fn().mockImplementation(() => Promise.resolve());
const mockOn = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
    createChannel: mockCreateChannel,
    on: mockOn,
    close: mockClose
});

jest.mock('amqplib', () => ({
    connect: (...args: unknown[]) => mockConnect(...args)
}));

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
        enableRabbitMQ();
        const result = await publishToQueue({ queue: 'emails', payload: { to: 'a@b.c' } });
        expect(result).toBe(true);
        expect(mockAssertQueue).toHaveBeenCalledWith('emails', { durable: true });
        expect(mockSendToQueue).toHaveBeenCalledWith('emails', expect.any(Buffer), {
            persistent: true
        });
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

    it('registers a consumer when enabled', async () => {
        enableRabbitMQ();
        const handler = jest.fn().mockResolvedValue(true);
        await consumeFromQueue({ queue: 'pdfs', handler });
        expect(mockAssertQueue).toHaveBeenCalledWith('pdfs', { durable: true });
        expect(mockPrefetch).toHaveBeenCalledWith(1);
        expect(mockConsume).toHaveBeenCalled();
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
const captureConsumerCallback = async (handler: jest.Mock) => {
    enableRabbitMQ();
    mockAssertQueue.mockResolvedValue({ queue: 'jobs', messageCount: 0, consumerCount: 0 });
    mockPrefetch.mockImplementation(() => Promise.resolve());
    mockConsume.mockResolvedValue({ consumerTag: 'tag-1' });
    mockCreateChannel.mockResolvedValue({
        assertQueue: mockAssertQueue,
        sendToQueue: mockSendToQueue,
        prefetch: mockPrefetch,
        consume: mockConsume,
        ack: mockAck,
        nack: mockNack
    });
    mockConnect.mockResolvedValue({
        createChannel: mockCreateChannel,
        on: mockOn,
        close: mockClose
    });

    await consumeFromQueue({ queue: 'jobs', handler });

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

        // eslint-disable-next-line unicorn/no-useless-undefined -- the null delivery IS the case
        await onMessage(undefined);

        expect(handler).not.toHaveBeenCalled();
        expect(mockAck).not.toHaveBeenCalled();
        expect(mockNack).not.toHaveBeenCalled();
    });
});
