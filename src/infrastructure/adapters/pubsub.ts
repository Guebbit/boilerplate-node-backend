/**
 * @module
 * Redis pub/sub between the copies of the app: one process publishes a message, every process
 * subscribed to its channel receives it. Fail-open like every optional Redis dependency here: with
 * no Redis configured, or an unreachable one, a publish is dropped and a subscription never
 * arrives, and the caller keeps working on what its own process knows.
 *
 * Runs on the CACHE Redis (`NODE_REDIS_URL`), not the rate-limit one. Pub/sub stores no keys, so
 * the cache's eviction never touches it, while the limits instance exists to hold counters that
 * must not be shared with anything evictable. Two connections per process: a client in
 * subscriber mode can run no other command, so publishing has its own.
 *
 * A subscriber that is lost is NOT reconnected on a timer. It reports the loss once (`onLost`) and
 * the next {@link subscribeToChannel} call opens a fresh one, the same demand-driven recovery as
 * the cache. What was published while it was down is gone: pub/sub keeps nothing.
 *
 * @see docs/understand/redis-cache.md#live-messages-between-copies
 */

import { logger } from '@infrastructure/adapters/logger';
import {
    manageConnection,
    type ManagedConnection
} from '@infrastructure/adapters/managed-connection';
import { redisConfig } from '@infrastructure/adapters/config';
import {
    closeRedisClient,
    configuredRedisUrl,
    createRedisClient,
    type RedisClient
} from '@infrastructure/adapters/redis';

/** Whether pub/sub is on: Redis is configured. The cache's kill switch does not apply, it is about stale cached responses. */
const isPubSubEnabled = () => Boolean(configuredRedisUrl());

/**
 * One namespaced channel name. The prefix is the cache's, for the same reason: staging and
 * production on one Redis must not hear each other.
 *
 * @param name - the channel's own name
 */
const channelKey = (name: string) => `${redisConfig().NODE_REDIS_CACHE_PREFIX}:${name}`;

/**
 * Open and connect a client. Built per attempt, like the cache's: one that never finished
 * connecting has nothing worth keeping.
 *
 * @param onError - the `error` listener; node-redis crashes the process on an unhandled one
 */
const openClient = (onError: (error: unknown) => void): Promise<RedisClient | undefined> => {
    const url = configuredRedisUrl();
    if (!url) return Promise.resolve(undefined);

    const client = createRedisClient(url);
    client.on('error', onError);
    return client.connect().then(() => client);
};

/** Messages going out. Its own connection: the subscriber's cannot publish. */
const publisher = manageConnection<RedisClient>({
    unavailableMessage: 'Redis pub/sub unavailable, live messages stay on this process.',
    isEnabled: isPubSubEnabled,
    isReady: (client) => client.isReady,
    connect: () => openClient((error) => publisher.reportUnavailable(error)),
    close: closeRedisClient
});

/** Publishes still on their way, so {@link stopPubSub} can let them land before the socket closes. */
const publishing = new Set<Promise<void>>();

/**
 * Publish `message` on `channel` and move on: nobody waits for the subscribers, and a failure is
 * logged once and dropped.
 *
 * @param channel - the channel's own name, without the prefix
 * @param message - the payload, already a string
 */
export const publishMessage = (channel: string, message: string): void => {
    const sent: Promise<void> = publisher
        .get()
        .then((client) => client?.publish(channelKey(channel), message))
        .then(
            () => undefined,
            (error: unknown) => publisher.reportUnavailable(error)
        )
        .finally(() => publishing.delete(sent));
    publishing.add(sent);
};

/** Subscriber connections by channel name, each memoised and reopened on demand. */
const subscriptions = new Map<string, ManagedConnection<RedisClient>>();

/** True while {@link stopPubSub} closes the subscribers, so closing them is not reported as a loss. */
let stopping = false;

/**
 * Build the connection of one subscription: connect, subscribe, and tell `onLost` when the socket
 * dies without having been closed by us.
 *
 * @param channel - the channel's own name
 * @param onMessage - called with each message's raw text
 * @param onLost - called once per lost connection
 */
const subscriberConnection = (
    channel: string,
    onMessage: (message: string) => void,
    onLost: () => void
): ManagedConnection<RedisClient> => {
    const connection = manageConnection<RedisClient>({
        unavailableMessage: 'Redis pub/sub unavailable, live messages stay on this process.',
        isEnabled: isPubSubEnabled,
        isReady: (client) => client.isReady,
        connect: () =>
            openClient((error) => connection.reportUnavailable(error)).then((client) => {
                if (!client) return undefined;
                // node-redis emits `terminated` when it gave up reconnecting (`reconnectStrategy: false`); a close we asked for never does.
                client.on('terminated', () => {
                    if (stopping) return;
                    connection.forget();
                    logger.warn({
                        message: 'Redis pub/sub subscriber lost; its open streams are ended.'
                    });
                    onLost();
                });
                // https://redis.io/docs/latest/commands/subscribe/ — the listener receives each message's payload text.
                return client.subscribe(channelKey(channel), onMessage).then(
                    () => client,
                    // A client left open by a refused SUBSCRIBE would never be closed: the lifecycle only knows handles that connected.
                    (error: unknown) =>
                        closeRedisClient(client).then(() => {
                            throw error;
                        })
                );
            }),
        close: closeRedisClient
    });
    return connection;
};

/**
 * Make sure this process is subscribed to `channel`. Resolves once it is, or at once when Redis is
 * off or unreachable (resolving `false`): the caller serves its own process either way.
 *
 * Called on demand, not at boot: a process with nobody to deliver to opens no subscriber.
 *
 * @param channel - the channel's own name, without the prefix
 * @param onMessage - called with each message's raw text; the first call's listener stays
 * @param onLost - called once each time the subscriber connection is lost; the first call's stays
 * @returns whether a subscription is live
 */
export const subscribeToChannel = (
    channel: string,
    onMessage: (message: string) => void,
    onLost: () => void
): Promise<boolean> => {
    const connection =
        subscriptions.get(channel) ?? subscriberConnection(channel, onMessage, onLost);
    subscriptions.set(channel, connection);

    return connection.get().then((client) => client !== undefined);
};

/**
 * Close the subscribers and the publisher, after letting the publishes already started land. Safe
 * to call when nothing was ever opened.
 */
export const stopPubSub = (): Promise<void> => {
    stopping = true;
    return Promise.all(publishing)
        .then(() => Promise.all([...subscriptions.values()].map((one) => one.stop())))
        .then(() => {
            subscriptions.clear();
            return publisher.stop();
        })
        .finally(() => {
            stopping = false;
        });
};
