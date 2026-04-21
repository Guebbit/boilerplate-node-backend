import { createClient, type RedisClientType } from 'redis';
import { logger } from './winston';

/**
 * Redis = a very fast in-memory data store.
 * Here we use it as a shared cache, so repeated GET requests can be served faster.
 */
type CacheValue = {
    status: number;
    body: unknown;
};

/**
 * Prefix all Redis keys so this app does not collide with other apps/environments.
 */
const CACHE_PREFIX = process.env.NODE_REDIS_CACHE_PREFIX ?? 'boilerplate-node-backend';

const getRedisUrl = (): string | undefined => {
    if (process.env.NODE_REDIS_URL) return process.env.NODE_REDIS_URL;
    if (!process.env.NODE_REDIS_PORT) return;

    const host = process.env.NODE_REDIS_HOST ?? '127.0.0.1';
    return `redis://${host}:${process.env.NODE_REDIS_PORT}`;
};

/**
 * Hold the shared Redis client instance.
 */
let client: RedisClientType | undefined;

/**
 * Hold the in-flight connect promise so parallel requests reuse the same connection attempt.
 */
let connectPromise: Promise<RedisClientType | void> | undefined;

/**
 * Avoid logging the same "Redis is down" warning again and again.
 */
let connectionWarningLogged = false;

/**
 * Turn cache usage on only when Redis is configured and not explicitly disabled.
 */
const isCacheEnabled = () =>
    Boolean(getRedisUrl()) && process.env.NODE_REDIS_CACHE_ENABLED !== '0';

/**
 * Build one namespaced Redis key.
 */
const prefix = (value: string) => `${CACHE_PREFIX}:${value}`;

/**
 * Log one warning when Redis is unavailable, then stay quiet until a reconnect succeeds.
 */
const logConnectionWarning = (error: unknown) => {
    if (connectionWarningLogged) return;

    logger.warn({
        message: 'Redis cache unavailable, continuing without server-side cache.',
        error: error instanceof Error ? error.message : String(error)
    });
    connectionWarningLogged = true;
};

/**
 * Reuse one Redis client for the whole app.
 * If Redis is off/unreachable, we fail open and just skip server-side caching.
 */
const getClient = (): Promise<RedisClientType | void> => {
    if (!isCacheEnabled()) return Promise.resolve();
    if (client?.isReady) return Promise.resolve(client);
    if (connectPromise) return connectPromise;

    // Create the client only once, then reuse it for the rest of the app lifetime.
    if (!client) {
        const redisUrl = getRedisUrl();
        if (!redisUrl) return Promise.resolve();

        client = createClient({
            url: redisUrl,
            socket: {
                connectTimeout: 1000,
                reconnectStrategy: false
            }
        });

        client.on('error', logConnectionWarning);
    }

    const redisClient = client;

    const promise: Promise<RedisClientType | void> = redisClient
        .connect()
        .then(() => {
            // If connect worked, allow future warnings again for later failures.
            connectionWarningLogged = false;
            return redisClient;
        })
        .catch((error: unknown) => {
            logConnectionWarning(error);
            return;
        })
        .finally(() => {
            connectPromise = undefined;
        });

    connectPromise = promise;

    return connectPromise;
};

/**
 * Warm up Redis during app startup so the first request does not pay the connect cost.
 */
export const startCache = () => getClient();

export const stopCache = (): Promise<void> => {
    connectPromise = undefined;
    const redisClient = client;
    client = undefined;
    if (!redisClient || !redisClient.isOpen) return Promise.resolve();

    return redisClient
        .quit()
        .catch(() => {
            redisClient.disconnect();
        })
        .then(() => {});
};

/**
 * Read one cached HTTP response from Redis.
 */
export const getCacheValue = (key: string): Promise<CacheValue | void> =>
    getClient()
        .then((redisClient) => {
            if (!redisClient) return;

            // Read the raw JSON payload for this HTTP response.
            return redisClient.get(prefix(`key:${key}`)).then((raw) => {
                if (!raw) return;
                return JSON.parse(raw) as CacheValue;
            });
        })
        .catch((error) => {
            logger.warn({
                message: 'Redis cache read failed.',
                key,
                error: error instanceof Error ? error.message : String(error)
            });
            return;
        });

/**
 * Save one HTTP response in Redis and attach it to one or more "tags".
 * Tags let us delete groups of cached responses later (example: all "products" cache).
 */
export const setCacheValue = (
    key: string,
    value: CacheValue,
    ttlSeconds: number,
    tags: string[] = []
): Promise<void> => {
    if (ttlSeconds <= 0) return Promise.resolve();

    const cacheKey = prefix(`key:${key}`);
    const cacheTags = [...new Set(tags.filter(Boolean))];

    return getClient()
        .then((redisClient) => {
            if (!redisClient) return;

            // Save the response body with a TTL so Redis evicts it automatically later.
            return redisClient
                .set(cacheKey, JSON.stringify(value), {
                    EX: ttlSeconds
                })
                .then(() =>
                    // Also index this key by tags so future writes can invalidate related reads.
                    Promise.all(
                        cacheTags.map((tag) => redisClient.sAdd(prefix(`tag:${tag}`), cacheKey))
                    )
                )
                .then(() => {});
        })
        .catch((error) => {
            logger.warn({
                message: 'Redis cache write failed.',
                key,
                error: error instanceof Error ? error.message : String(error)
            });
        });
};

/**
 * Remove all cached responses linked to the given tags.
 * We use this after successful writes so old/stale GET responses disappear.
 */
export const invalidateCacheTags = (tags: string[]): Promise<void> => {
    const cacheTags = [...new Set(tags.filter(Boolean))];
    if (cacheTags.length === 0) return Promise.resolve();

    return getClient()
        .then((redisClient) => {
            if (!redisClient) return;

            // For each tag:
            // 1) read all cached keys in that group
            // 2) delete those cached responses
            // 3) delete the tag set itself
            return Promise.all(
                cacheTags.map((tag) => {
                    const tagKey = prefix(`tag:${tag}`);
                    return redisClient
                        .sMembers(tagKey)
                        .then((keys) => (keys.length > 0 ? redisClient.del(keys) : undefined))
                        .then(() => redisClient.del(tagKey));
                })
            ).then(() => {});
        })
        .catch((error) => {
            logger.warn({
                message: 'Redis cache invalidation failed.',
                tags: cacheTags,
                error: error instanceof Error ? error.message : String(error)
            });
        });
};
