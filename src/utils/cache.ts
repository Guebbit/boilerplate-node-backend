import { createClient, type RedisClientType } from 'redis';
import { logger } from './winston';

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

    connectPromise = client
        .connect()
        .then(() => {
            connectionWarningLogged = false;
            return client;
        })
        .catch((error: unknown) => {
            logConnectionWarning(error);
            return;
        })
        .finally(() => {
            connectPromise = undefined;
        });

    return connectPromise;
};

export const startCache = async () => {
    await getClient();
};

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
