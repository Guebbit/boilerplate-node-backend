/**
 * @module
 * Where the rate limiters keep their counters. `express-rate-limit`'s default store is an
 * in-process `Map`, and `cluster.ts` forks one worker per CPU — so a single-process budget becomes
 * `budget × workers`. The `limits` Redis (`src/infrastructure/adapters/limits-redis.ts`) makes it one budget again,
 * across workers and instances. It is a separate INSTANCE from the response cache, so a flood of
 * cache keys can never evict a counter.
 */

import {
    MemoryStore,
    type ClientRateLimitInfo,
    type Options,
    type Store
} from 'express-rate-limit';
import type { RateLimitBudget } from '@types';
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
import { createBreaker } from '@infrastructure/http/middlewares/store-breaker';
import { rateLimitStoreFallbackTotal } from '@infrastructure/observability/metrics-rate-limit';
import { clusterConfig } from '@infrastructure/runtime/config';

/**
 * How long every budget skips Redis after a store error, before one request probes it again. Long
 * enough that an outage does not add the 1 s connect timeout to every request, short enough that a
 * recovered Redis is back in service within the minute.
 */
const BREAKER_WINDOW_MS = 30_000;

/**
 * One breaker for the whole process: every budget counts in the same Redis, so one failure says
 * the same thing about all of them.
 */
const breaker = createBreaker(BREAKER_WINDOW_MS);

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
            // into "the process is gone" — exactly the outage `failoverStore` is written to survive.
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
                            'Rate-limit Redis store failed to initialise — budgets fall back until it recovers.',
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
 * A store that answers from `primary` while Redis works, and from somewhere safe while it does not.
 *
 * Failure policy, per budget (`RateLimitBudget.onStoreError`):
 *   memory: the budget counts in this process (a `MemoryStore`), so a limit still holds, per worker.
 *   pass:   the call rejects, and `passOnStoreError` lets the request through unbudgeted.
 * A security control fails SECURE (OWASP A10:2025), so `memory` is the default and `pass` is
 * reserved for the browsing brake. https://top10.owasp.org/2025/A10_2025-Mishandling_of_Exceptional_Conditions/
 *
 * The breaker keeps an outage from costing every request the connect timeout.
 *
 * @param namespace - the budget, for the fallback counter's label
 * @param primary - the Redis-backed store
 * @param onStoreError - what this budget does while Redis is unavailable
 */
const failoverStore = (
    namespace: string,
    primary: Store,
    onStoreError: NonNullable<RateLimitBudget['onStoreError']>
): Store => {
    const fallback = new MemoryStore();

    /** Serve one operation without Redis, per the budget's policy. */
    const withoutRedis = <T>(use: (store: Store) => T | Promise<T>): Promise<T> => {
        rateLimitStoreFallbackTotal.inc({ namespace });
        if (onStoreError === 'pass')
            return Promise.reject(new Error('The limits Redis is unavailable.'));
        return Promise.resolve(use(fallback));
    };

    /** Try Redis if the breaker allows it; any failure opens the breaker and falls back. */
    const route = <T>(use: (store: Store) => T | Promise<T>): Promise<T> => {
        if (!breaker.admit()) return withoutRedis(use);

        return Promise.resolve()
            .then(() => use(primary))
            .then((result) => {
                breaker.succeeded();
                return result;
            })
            .catch(() => {
                breaker.failed();
                return withoutRedis(use);
            });
    };

    return {
        init: (received: Options) => {
            fallback.init(received);
            void primary.init?.(received);
        },
        increment: (key: string) => route((store) => store.increment(key)),
        decrement: (key: string) => route((store) => store.decrement(key)).then(() => undefined),
        resetKey: (key: string) => route((store) => store.resetKey(key)).then(() => undefined),
        get: (key: string) => route((store) => store.get?.(key))
    };
};

/**
 * Say, once per budget, that counting is per process: with more than one worker and no Redis a
 * security control is silently off by a factor of the worker count.
 *
 * `error`, not `warn`: that belongs at the level someone is paged for, not in the noise.
 *
 * @param namespace - the budget
 */
const warnPerProcessCounting = (namespace: string): void => {
    if (limitsRedisUrl() || clusterConfig().NODE_CLUSTER_WORKERS === 1) return;
    // Stryker disable all
    logger.error({
        message:
            'Rate limiting is counting per process: no Redis is configured and this app runs a worker per CPU. ' +
            'Every budget in NODE_RATE_LIMIT_* is effectively multiplied by the worker count. ' +
            'Set NODE_RATE_LIMIT_REDIS_URL, or run NODE_CLUSTER_WORKERS=1.',
        namespace
    });
    // Stryker restore all
};

/**
 * The plain store one counter lives in: Redis behind a failover when a `limits` URL is configured,
 * an in-process one otherwise. Split out so the escalating wrapper below can build several.
 *
 * @param namespace - the counter's key prefix
 * @param onStoreError - what the budget does while the `limits` Redis is unavailable
 */
const plainStore = (
    namespace: string,
    onStoreError: NonNullable<RateLimitBudget['onStoreError']>
): Store => {
    const url = limitsRedisUrl();

    if (!url) return new MemoryStore();

    return failoverStore(namespace, lazyRedisStore(namespace, url), onStoreError);
};

/**
 * A record's hit count, or 0 once its window ended. `MemoryStore#get` answers an expired entry
 * until its sweep runs, which would keep a lockout alive past its time; Redis has already
 * dropped the key by then.
 */
const liveHits = (record: ClientRateLimitInfo | undefined): number =>
    record && (!record.resetTime || record.resetTime.getTime() > Date.now()) ? record.totalHits : 0;

/** What {@link escalatingStore} needs to know about the budget it escalates. */
export interface Escalation {
    /** The cap: a key whose count passes it is locked. */
    limit: number;
    /** How many times the lockout may double. */
    doublings: number;
}

/**
 * A store whose lockout doubles each time the same key hits the cap again.
 *
 * `express-rate-limit` counts hits in one fixed window per store, and neither Redis nor the memory
 * store can stretch one key's expiry afterwards. So the lockout lengths are separate stores, one
 * per level, each with its own window (`windowMs × 2^level`):
 *
 * ```
 * a request → is the key locked at ANY level? → keep counting there (still refused)
 *           → not locked: the strike count picks the level → count there
 *           → the count just passed the cap: record a strike
 * ```
 *
 * The strike count lives in one more store whose window outlasts the longest lockout, so a key
 * that behaves is forgotten. Every store is a {@link plainStore}, so Redis and its memory
 * fallback work for each level exactly as they do for a flat budget.
 *
 * @param namespace - the budget, prefixing every level's keys
 * @param onStoreError - what the budget does while the `limits` Redis is unavailable
 * @param escalation - the cap and the number of doublings
 */
const escalatingStore = (
    namespace: string,
    onStoreError: NonNullable<RateLimitBudget['onStoreError']>,
    escalation: Escalation
): Store => {
    const levels = Array.from({ length: escalation.doublings + 1 }, (_unused, level) =>
        plainStore(`${namespace}:x${String(level)}`, onStoreError)
    );
    const strikes = plainStore(`${namespace}:strikes`, onStoreError);
    // Which level a key was last counted at, so a successful request un-counts the right one.
    const lastLevel = new Map<string, number>();

    /** The level a key is currently locked at, if any: its count has passed the cap. */
    const lockedLevel = async (key: string): Promise<number | undefined> => {
        for (const [level, store] of [...levels.entries()].toReversed())
            if (liveHits(await store.get?.(key)) > escalation.limit) return level;
        return undefined;
    };

    /** Count one hit at a level, remembering it for a later `decrement`. */
    const countAt = (level: number, key: string) => {
        lastLevel.set(key, level);
        return levels[level].increment(key);
    };

    return {
        init: (received: Options) => {
            for (const [level, store] of levels.entries())
                void store.init?.({ ...received, windowMs: received.windowMs * 2 ** level });
            // Outlasts the longest lockout, so a well-behaved key is forgotten.
            void strikes.init?.({
                ...received,
                windowMs: received.windowMs * 2 ** (escalation.doublings + 1)
            });
        },
        increment: async (key: string) => {
            const locked = await lockedLevel(key);
            if (locked !== undefined) return countAt(locked, key);

            const recorded = liveHits(await strikes.get?.(key));
            const result = await countAt(Math.min(recorded, escalation.doublings), key);
            // The count just passed the cap: this is a lockout, and the next one is longer.
            if (result.totalHits === escalation.limit + 1) await strikes.increment(key);
            return result;
        },
        decrement: (key: string) => levels[lastLevel.get(key) ?? 0].decrement(key),
        resetKey: (key: string) =>
            Promise.all(
                [...levels, strikes].map((store) => Promise.resolve(store.resetKey(key)))
            ).then(() => undefined),
        get: async (key: string) => levels[(await lockedLevel(key)) ?? 0].get?.(key)
    };
};

/**
 * The store one limiter counts in.
 *
 * @param namespace - which budget these counters belong to, so two limiters sharing one Redis
 *  cannot spend each other's allowance
 * @param onStoreError - what the budget does while the `limits` Redis is unavailable
 * @param escalation - when given, repeated lockouts of one key double in length — see
 *  {@link escalatingStore}
 * @returns a Redis-backed store with a safe fallback when a `limits` URL is configured, an
 *  in-process one otherwise
 */
export const rateLimitStore = (
    namespace: string,
    onStoreError: NonNullable<RateLimitBudget['onStoreError']> = 'memory',
    escalation?: Escalation
): Store => {
    warnPerProcessCounting(namespace);
    return escalation
        ? escalatingStore(namespace, onStoreError, escalation)
        : plainStore(namespace, onStoreError);
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
