import { setEnvironment } from '@tests/environment';
/**
 * Pub/sub adapter — messages between the copies of the app.
 *
 * Three promises are checked, each of which fails silently when broken:
 *
 *   1. **Fail open.** No Redis, a refused connect or a refused publish must never reject: the
 *      writer of a notification has already succeeded by the time it publishes.
 *   2. **Prefixing.** The channel carries the cache's prefix, so staging and production sharing a
 *      Redis do not hear each other.
 *   3. **A lost subscriber says so, once, and a stop is not a loss.** The caller ends its streams
 *      on the first; ending them again on a deploy's own shutdown would be noise.
 *
 * The adapter memoises its connections in module scope, so each case re-imports it.
 */

/** One fake node-redis client; the cases drive its events and read its calls. */
interface FakeClient {
    on: jest.Mock;
    connect: jest.Mock;
    publish: jest.Mock;
    subscribe: jest.Mock;
    close: jest.Mock;
    destroy: jest.Mock;
    isReady: boolean;
    /** Fires every listener registered for `event`, as node-redis would. */
    emit: (event: string) => void;
}

/** Every client the adapter built, in order. */
let clients: FakeClient[] = [];

/** What `connect()` does next; a case swaps it to refuse. */
let connectResult: () => Promise<void> = () => Promise.resolve();

/** What `publish()` does next; a case swaps it to refuse. */
let publishResult: () => Promise<number> = () => Promise.resolve(1);

/** What `subscribe()` does next; a case swaps it to refuse. */
let subscribeResult: () => Promise<void> = () => Promise.resolve();

/** A client whose commands resolve and whose `isReady` is true once connected. */
const makeClient = (): FakeClient => {
    const listeners = new Map<string, (() => void)[]>();
    const client: FakeClient = {
        on: jest.fn((event: string, listener: () => void) => {
            listeners.set(event, [...(listeners.get(event) ?? []), listener]);
        }),
        connect: jest.fn(() =>
            connectResult().then(() => {
                client.isReady = true;
            })
        ),
        publish: jest.fn(() => publishResult()),
        subscribe: jest.fn(() => subscribeResult()),
        close: jest.fn(() => Promise.resolve()),
        destroy: jest.fn(),
        isReady: false,
        emit: (event) => {
            client.isReady = false;
            for (const listener of listeners.get(event) ?? []) listener();
        }
    };
    clients.push(client);
    return client;
};

jest.mock('redis', () => ({
    createClient: () => makeClient()
}));

jest.mock('@infrastructure/adapters/logger', () => ({
    logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }
}));

/** The adapter with module state discarded, so no case reuses another's connection. */
const freshPubSub = () => {
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.resetModules demands a fresh synchronous require
    return require('@infrastructure/adapters/pubsub') as typeof import('@infrastructure/adapters/pubsub');
};

beforeEach(() => {
    clients = [];
    connectResult = () => Promise.resolve();
    publishResult = () => Promise.resolve(1);
    subscribeResult = () => Promise.resolve();
    setEnvironment({ NODE_REDIS_URL: 'redis://localhost:6379' });
    setEnvironment({ NODE_REDIS_CACHE_PREFIX: 'staging' });
});

describe('with no Redis configured', () => {
    beforeEach(() => {
        setEnvironment({ NODE_REDIS_URL: undefined });
        setEnvironment({ NODE_REDIS_PORT: undefined });
    });

    it('drops a publish without opening a connection', async () => {
        const pubsub = freshPubSub();

        pubsub.publishMessage('notifications', 'hello');
        await pubsub.stopPubSub();

        expect(clients).toHaveLength(0);
    });

    it('resolves a subscription as not live, and opens nothing', async () => {
        const pubsub = freshPubSub();

        await expect(
            pubsub.subscribeToChannel('notifications', jest.fn(), jest.fn())
        ).resolves.toBe(false);

        expect(clients).toHaveLength(0);
    });
});

describe('publishing', () => {
    it('sends the message on the prefixed channel', async () => {
        const pubsub = freshPubSub();

        pubsub.publishMessage('notifications', '{"a":1}');
        await pubsub.stopPubSub();

        expect(clients[0]?.publish).toHaveBeenCalledWith('staging:notifications', '{"a":1}');
    });

    it('lets a publish still on its way land before the socket closes', async () => {
        const pubsub = freshPubSub();

        pubsub.publishMessage('notifications', 'late');
        await pubsub.stopPubSub();

        const [publisher] = clients;
        expect(publisher?.publish).toHaveBeenCalledTimes(1);
        expect(publisher?.close).toHaveBeenCalledTimes(1);
        const order = [
            publisher?.publish.mock.invocationCallOrder[0] ?? 0,
            publisher?.close.mock.invocationCallOrder[0] ?? 0
        ];
        expect(order[0]).toBeLessThan(order[1]);
    });

    it('drops the message, and does not throw, when Redis refuses the connection', async () => {
        connectResult = () => Promise.reject(new Error('ECONNREFUSED'));
        const pubsub = freshPubSub();

        pubsub.publishMessage('notifications', 'lost');

        await expect(pubsub.stopPubSub()).resolves.toBeUndefined();
        expect(clients[0]?.publish).not.toHaveBeenCalled();
    });

    it('drops the message, and does not throw, when Redis refuses the publish', async () => {
        publishResult = () => Promise.reject(new Error('READONLY'));
        const pubsub = freshPubSub();

        pubsub.publishMessage('notifications', 'refused');

        await expect(pubsub.stopPubSub()).resolves.toBeUndefined();
        expect(clients[0]?.publish).toHaveBeenCalledTimes(1);
    });
});

describe('subscribing', () => {
    it('subscribes to the prefixed channel and hands each message to the listener', async () => {
        const pubsub = freshPubSub();
        const onMessage = jest.fn();

        await expect(
            pubsub.subscribeToChannel('notifications', onMessage, jest.fn())
        ).resolves.toBe(true);

        const [subscriber] = clients;
        expect(subscriber?.subscribe).toHaveBeenCalledWith('staging:notifications', onMessage);
    });

    it('reuses the live subscriber for a second call instead of opening another', async () => {
        const pubsub = freshPubSub();

        await pubsub.subscribeToChannel('notifications', jest.fn(), jest.fn());
        await pubsub.subscribeToChannel('notifications', jest.fn(), jest.fn());

        expect(clients).toHaveLength(1);
    });

    it('resolves not live, and closes the client, when the subscribe is refused', async () => {
        subscribeResult = () => Promise.reject(new Error('NOPERM'));
        const pubsub = freshPubSub();

        await expect(
            pubsub.subscribeToChannel('notifications', jest.fn(), jest.fn())
        ).resolves.toBe(false);

        expect(clients[0]?.close).toHaveBeenCalledTimes(1);
    });

    it('tells the caller once when the connection is lost, and reopens on the next call', async () => {
        const pubsub = freshPubSub();
        const onLost = jest.fn();
        await pubsub.subscribeToChannel('notifications', jest.fn(), onLost);

        clients[0]?.emit('terminated');

        expect(onLost).toHaveBeenCalledTimes(1);
        await pubsub.subscribeToChannel('notifications', jest.fn(), onLost);
        expect(clients).toHaveLength(2);
        expect(clients[1]?.subscribe).toHaveBeenCalledTimes(1);
    });

    it('does not report a loss when it closes the subscriber itself', async () => {
        const pubsub = freshPubSub();
        const onLost = jest.fn();
        await pubsub.subscribeToChannel('notifications', jest.fn(), onLost);
        clients[0]?.close.mockImplementation(() => {
            clients[0]?.emit('terminated');
            return Promise.resolve();
        });

        await pubsub.stopPubSub();

        expect(onLost).not.toHaveBeenCalled();
        expect(clients[0]?.close).toHaveBeenCalledTimes(1);
    });
});
