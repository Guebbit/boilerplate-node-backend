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

const CACHE_PREFIX = process.env.NODE_REDIS_CACHE_PREFIX ?? 'boilerplate-node-backend';

let client: RedisClientType | undefined;
let connectPromise: Promise<RedisClientType | undefined> | undefined;
let connectionWarningLogged = false;

const isCacheEnabled = () =>
    Boolean(process.env.NODE_REDIS_URL) && process.env.NODE_REDIS_CACHE_ENABLED !== '0';

const prefix = (value: string) => `${CACHE_PREFIX}:${value}`;

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
const getClient = async (): Promise<RedisClientType | undefined> => {
    if (!isCacheEnabled()) return;
    if (client?.isReady) return client;
    if (connectPromise) return connectPromise;

    if (!client) {
        client = createClient({
            url: process.env.NODE_REDIS_URL,
            socket: {
                connectTimeout: 1000,
                reconnectStrategy: false
            }
        });

        client.on('error', logConnectionWarning);
    }

    const promise = (async (): Promise<RedisClientType | undefined> => {
        try {
            await client.connect();
            connectionWarningLogged = false;
            return client;
        } catch (error: unknown) {
            logConnectionWarning(error);
            return;
        } finally {
            connectPromise = undefined;
        }
    })();

    connectPromise = promise;

    return connectPromise;
};

export const startCache = async () => {
    await getClient();
};

/**
 * Read one cached HTTP response from Redis.
 */
export const getCacheValue = async (key: string): Promise<CacheValue | undefined> => {
    const redisClient = await getClient();
    if (!redisClient) return;

    try {
        const raw = await redisClient.get(prefix(`key:${key}`));
        if (!raw) return;
        return JSON.parse(raw) as CacheValue;
    } catch (error) {
        logger.warn({
            message: 'Redis cache read failed.',
            key,
            error: error instanceof Error ? error.message : String(error)
        });
        return;
    }
};

/**
 * Save one HTTP response in Redis and attach it to one or more "tags".
 * Tags let us delete groups of cached responses later (example: all "products" cache).
 */
export const setCacheValue = async (
    key: string,
    value: CacheValue,
    ttlSeconds: number,
    tags: string[] = []
) => {
    if (ttlSeconds <= 0) return;

    const redisClient = await getClient();
    if (!redisClient) return;

    const cacheKey = prefix(`key:${key}`);
    const cacheTags = [...new Set(tags.filter(Boolean))];

    try {
        await redisClient.set(cacheKey, JSON.stringify(value), {
            EX: ttlSeconds
        });

        await Promise.all(
            cacheTags.map((tag) => redisClient.sAdd(prefix(`tag:${tag}`), cacheKey))
        );
    } catch (error) {
        logger.warn({
            message: 'Redis cache write failed.',
            key,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};

/**
 * Remove all cached responses linked to the given tags.
 * We use this after successful writes so old/stale GET responses disappear.
 */
export const invalidateCacheTags = async (tags: string[]) => {
    const redisClient = await getClient();
    if (!redisClient) return;

    const cacheTags = [...new Set(tags.filter(Boolean))];
    if (cacheTags.length === 0) return;

    try {
        for (const tag of cacheTags) {
            const tagKey = prefix(`tag:${tag}`);
            const keys = await redisClient.sMembers(tagKey);
            if (keys.length > 0) await redisClient.del(keys);
            await redisClient.del(tagKey);
        }
    } catch (error) {
        logger.warn({
            message: 'Redis cache invalidation failed.',
            tags: cacheTags,
            error: error instanceof Error ? error.message : String(error)
        });
    }
};
