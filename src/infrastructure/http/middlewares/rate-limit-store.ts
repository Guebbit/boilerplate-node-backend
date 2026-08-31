/**
 * @module
 * Where the rate limiters keep their counters. `express-rate-limit`'s default store is an
 * in-process `Map`, and `cluster.ts` forks one worker per CPU — so a single-process budget becomes
 * `budget × workers`. Redis makes it one budget again, across workers and instances, and fails
 * open on error (`passOnStoreError` in `rate-limit.ts`) rather than turning an outage into an
 * authentication outage. A separate connection from the cache, so disabling that never disables this.
 */

import { createClient, type RedisClientType } from 'redis';
import { MemoryStore, type Options, type Store } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { logger } from '@infrastructure/adapters/logger';
import { environmentFlag, environmentNumber } from '@infrastructure/runtime/environment';
import {
    manageConnection,
    type ManagedConnection
} from '@infrastructure/adapters/managed-connection';

/**
 * Key namespace for every limiter counter. Separate from the cache's prefix so
 * `NODE_REDIS_CACHE_PREFIX` can be rotated — or the cache flushed wholesale — without also
 * resetting everyone's budget.
 */
const KEY_PREFIX = process.env.NODE_REDIS_RATE_LIMIT_PREFIX ?? 'rate-limit';

/**
 * The limiter's own Redis URL. Falls back to the cache's, because one Redis is the normal
 * deployment and asking for the same URL twice is a way to get two different ones.
 */
const redisUrl = (): string | undefined => {
    /*
     * The explicit kill switch, the twin of `NODE_REDIS_CACHE_ENABLED`. Needed because the URL is
     * INHERITED from the cache's, so "do not share counters" cannot be said by leaving a variable
     * unset — `src/app.ts` imports `dotenv/config`, so `.env`'s compose hostname reaches every
     * test, and without this the limiters would fail open against a Redis that is not there.
     */
    if (!environmentFlag('NODE_RATE_LIMIT_REDIS_ENABLED', true)) return;
    if (process.env.NODE_RATE_LIMIT_REDIS_URL) return process.env.NODE_RATE_LIMIT_REDIS_URL;
    if (process.env.NODE_REDIS_URL) return process.env.NODE_REDIS_URL;
    if (!process.env.NODE_REDIS_PORT) return;

    const host = process.env.NODE_REDIS_HOST ?? '127.0.0.1';
    return `redis://${host}:${process.env.NODE_REDIS_PORT}`;
};

/**
 * Construct (but do not connect) the limiter's own Redis client.
 *
 * @param url - the limiter's Redis URL — see {@link redisUrl}
 */
const build = (url: string): RedisClientType => {
    const redisClient: RedisClientType = createClient({
        url,
        socket: {
            connectTimeout: 1000,
            /*
             * No reconnect loop, like the cache's client: it would retry forever, keeping the
             * event loop alive after the process should exit. One clean try per command instead.
             */
            reconnectStrategy: false
        }
    });

    // node-redis is an EventEmitter and an unhandled 'error' event would crash the process, so this
    // listener is mandatory rather than merely useful.
    redisClient.on('error', () => undefined);

    return redisClient;
};

/**
 * The one client every limiter shares — lifecycle (memoised handle, deduped connect, warn-once)
 * delegated to {@link manageConnection}, same as the cache and queue adapters. Unlike them, this
 * fails CLOSED: `getOrThrow` rejects instead of resolving `undefined`, and the outage logs at
 * `error` rather than `warn` — see the header for why.
 */
let redisConnection: ManagedConnection<RedisClientType> | undefined;

const connectionFor = (url: string): ManagedConnection<RedisClientType> => {
    if (redisConnection) return redisConnection;

    // Kept apart from `manageConnection`'s own memoised handle: a client whose handshake hasn't
    // finished is still the SAME socket worth reconnecting, not one to throw away. node-redis
    // rejects a second `connect()` racing the first with `Socket already opened`, so a fresh
    // client per attempt (like the cache adapter) is not an option here.
    let redisClient: RedisClientType | undefined;

    const connection = manageConnection<RedisClientType>({
        unavailableMessage:
            'Rate-limit Redis unreachable — requests are passing unbudgeted until it returns.',
        unavailableLevel: 'error',
        // Enablement is already decided by `rateLimitStore` before a Redis-backed store is ever
        // built — this connection only exists when Redis is configured.
        isEnabled: () => true,
        connect: () => {
            redisClient ??= build(url);
            const client = redisClient;

            return client.connect().then(
                () => client,
                (error: unknown) => {
                    redisClient = undefined;
                    client.destroy();
                    throw error;
                }
            );
        },
        isReady: (client) => client.isReady,
        close: (client) => {
            redisClient = undefined;
            return client
                ? client.quit().then(
                      () => undefined,
                      () => client.destroy()
                  )
                : Promise.resolve();
        },
        onRecovered: () =>
            logger.info({ message: 'Rate-limit Redis is back — counters are shared again.' })
    });

    redisConnection = {
        ...connection,
        forget: () => {
            redisClient = undefined;
            connection.forget();
        }
    };

    return redisConnection;
};

/**
 * Send one command, opening the connection if this is the first that needs it.
 *
 * Rejects when Redis cannot be reached, which `passOnStoreError` turns into "let the request
 * through" rather than a 500 — see the header. The client is forgotten on failure so the next
 * command starts from a clean socket instead of retrying a dead one.
 */
const send = (url: string, command: string[]): Promise<RedisReply> => {
    const connection = connectionFor(url);

    return connection.getOrThrow().then((redisClient) =>
        /*
         * The reply type is stated, not inferred: node-redis answers a wide `ReplyUnion` for an
         * arbitrary command, while only `INCR`, `DECR`, `PTTL` and `DEL` are ever sent here — all
         * four answer an integer.
         */
        redisClient.sendCommand<RedisReply>(command).catch((error: unknown) => {
            redisClient.destroy();
            connection.forget();
            connection.reportUnavailable(error);
            throw error;
        })
    );
};

/**
 * A `RedisStore` that is not built until something is counted.
 *
 * `express-rate-limit` calls `init` at module load, and `RedisStore.init` loads Lua scripts — a
 * connection. Deferring construction to the first `increment` keeps importing this module free.
 * Every other method delegates; `increment` is always first, since nothing decrements or resets a
 * key it hasn't counted.
 */
const lazyRedisStore = (namespace: string, url: string): Store => {
    let inner: RedisStore | undefined;
    let options: Options | undefined;

    const store = (): RedisStore => {
        if (!inner) {
            inner = new RedisStore({
                prefix: `${KEY_PREFIX}:${namespace}:`,
                // `rate-limit-redis` speaks raw Redis commands so it works with any client; this
                // is the one line that binds it to node-redis.
                sendCommand: (...command: string[]) => send(url, command)
            });
            // The options `init` was given at construction, replayed now that there is a store.
            // `windowMs` is the only one `RedisStore` reads.
            //
            // The `.catch()` is load-bearing: `init()` awaits Lua script loads, so any failure —
            // Redis unreachable, an unrecognised reply — rejects this fire-and-forget promise. An
            // uncaught rejection is fatal by default (Node 15+), turning "Redis had a bad moment"
            // into "the process is gone" — exactly the outage `send()` is written to fail open from.
            if (options)
                void inner.init(options).catch((error: unknown) => {
                    logger.error({
                        message:
                            'Rate-limit Redis store failed to initialise — requests are passing unbudgeted until it recovers.',
                        error: error instanceof Error ? error.message : String(error)
                    });
                });
        }

        return inner;
    };

    return {
        init: (received: Options) => {
            options = received;
        },
        increment: (key: string) => store().increment(key),
        decrement: (key: string) => store().decrement(key),
        resetKey: (key: string) => store().resetKey(key),
        get: (key: string) => store().get(key)
    };
};

/**
 * The store one limiter counts in.
 *
 * @param namespace - which budget these counters belong to, so two limiters sharing one Redis
 *  cannot spend each other's allowance
 * @returns a Redis-backed store when Redis is configured, an in-process one otherwise
 */
export const rateLimitStore = (namespace: string): Store => {
    const url = redisUrl();

    if (!url) {
        /*
         * `error`, not `warn`: with more than one worker this is a security control silently not
         * doing what its config claims, off by a factor of the worker count — that belongs at the
         * level someone is paged for, not in the noise.
         */
        if (environmentNumber('NODE_CLUSTER_WORKERS', 0) !== 1)
            logger.error({
                message:
                    'Rate limiting is counting per process: no Redis is configured and this app runs a worker per CPU. ' +
                    'Every budget in NODE_RATE_LIMIT_* is effectively multiplied by the worker count. ' +
                    'Set NODE_REDIS_URL (or NODE_RATE_LIMIT_REDIS_URL), or run NODE_CLUSTER_WORKERS=1.',
                namespace
            });

        return new MemoryStore();
    }

    return lazyRedisStore(namespace, url);
};

/** Release the limiter's connection on shutdown, so a restart begins from a clean socket. */
export const stopRateLimitStore = (): Promise<void> =>
    redisConnection ? redisConnection.stop() : Promise.resolve();
