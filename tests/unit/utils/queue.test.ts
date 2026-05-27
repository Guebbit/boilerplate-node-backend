import {
    isQueueEnabled,
    publishToQueue,
    consumeFromQueue,
    startQueue,
    stopQueue
} from '@utils/queue';

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
