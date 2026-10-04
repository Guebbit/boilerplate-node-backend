/**
 * @module
 * Where the rate limiters keep their counters. `express-rate-limit`'s default store is an
 * in-process `Map`, and `cluster.ts` forks one worker per CPU — so a single-process budget becomes
 * `budget × workers`. The `limits` Redis (`src/infrastructure/adapters/limits-redis.ts`) makes it one budget again,
 * across workers and instances. It is a separate INSTANCE from the response cache, so a flood of
 * cache keys can never evict a counter.
 */

import { MemoryStore, type Options, type Store } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { logger } from '@infrastructure/adapters/logger';
import { drainMatchingKeys } from '@infrastructure/adapters/cache';
import {
    buildLimitsClient,
    limitsKeyPrefix,
    limitsRedisUrl,
    sendToLimits
} from '@infrastructure/adapters/limits-redis';
import { closeRedisClient } from '@infrastructure/adapters/redis';
import { clusterConfig } from '@infrastructure/runtime/config';

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
                prefix: `${limitsKeyPrefix()}:${namespace}:`,
                // `rate-limit-redis` speaks raw Redis commands so it works with any client; this
                // is the one line that binds it to node-redis.
                sendCommand: (...command: string[]) => sendToLimits(url, command)
            });
            // The options `init` was given at construction, replayed now that there is a store.
            // `windowMs` is the only one `RedisStore` reads.
            //
            // The `.catch()` is load-bearing: `init()` awaits Lua script loads, so any failure —
            // Redis unreachable, an unrecognised reply — rejects this fire-and-forget promise. An
            // uncaught rejection is fatal by default (Node 15+), turning "Redis had a bad moment"
            // into "the process is gone" — exactly the outage `send()` is written to fail open from.
            //
            // The failed store is also dropped: `RedisStore` keeps the rejected script-load promise
            // and awaits it on every later `increment`, so keeping it would leave this limiter
            // open until a restart. The next request builds a fresh one.
            if (options) {
                const failed = inner;
                void failed.init(options).catch((error: unknown) => {
                    if (inner === failed) inner = undefined;
                    // Stryker disable all
                    logger.error({
                        message:
                            'Rate-limit Redis store failed to initialise — requests are passing unbudgeted until it recovers.',
                        error
                    });
                    // Stryker restore all
                });
            }
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
    const url = limitsRedisUrl();

    if (!url) {
        /*
         * `error`, not `warn`: with more than one worker this is a security control silently not
         * doing what its config claims, off by a factor of the worker count — that belongs at the
         * level someone is paged for, not in the noise.
         */
        if (clusterConfig().NODE_CLUSTER_WORKERS !== 1)
            // Stryker disable all
            logger.error({
                message:
                    'Rate limiting is counting per process: no Redis is configured and this app runs a worker per CPU. ' +
                    'Every budget in NODE_RATE_LIMIT_* is effectively multiplied by the worker count. ' +
                    'Set NODE_RATE_LIMIT_REDIS_URL, or run NODE_CLUSTER_WORKERS=1.',
                namespace
            });
        // Stryker restore all

        return new MemoryStore();
    }

    return lazyRedisStore(namespace, url);
};

/**
 * Delete every limiter counter, so the next request starts with a full budget.
 *
 * For the e2e reset (`scenario:apply --reset`), which restores the data but would otherwise leave
 * every spent budget behind: the keys are identical after a reseed (fixed ids, a stable email
 * hash, 127.0.0.1).
 *
 * Scoped to this app's key prefix, never `FLUSHALL`, and independent of the cache's own clear
 * on purpose (a separate instance). Uses a short-lived client of its own: the shared one is
 * switched off in the process that calls this. Single-use claims share the prefix, so a reset
 * reopens those too.
 *
 * Never rejects; `reachable: false` tells the caller the counters may survive.
 *
 * @param url - the `limits` Redis URL as the DEPLOYMENT configured it (see
 *  {@link limitsRedisUrl}), read before anything switches the limiter off. `undefined` means
 *  no Redis: nothing to clear
 */
export const clearRateLimitCounters = (
    url: string | undefined
): Promise<{ deleted: number; reachable: boolean }> => {
    if (!url) return Promise.resolve({ deleted: 0, reachable: true });

    const redisClient = buildLimitsClient(url);

    return redisClient
        .connect()
        .then(() => drainMatchingKeys(redisClient, `${limitsKeyPrefix()}:*`))
        .then((deleted) => ({ deleted, reachable: true }))
        .catch((error: unknown) => {
            // Stryker disable all
            logger.warn({ message: 'Rate-limit counters could not be cleared.', error });
            // Stryker restore all
            return { deleted: 0, reachable: false };
        })
        .finally(() => closeRedisClient(redisClient));
};
