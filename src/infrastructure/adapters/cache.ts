/**
 * @module
 * Redis cache adapter — an opaque byte store with tags, nothing more. Every function fails open:
 * if Redis is unreachable the app keeps serving without a cache rather than erroring. What gets
 * cached (today, HTTP responses) and how it's framed is the caller's business, not this module's.
 *
 * See: docs/tools/redis-cache.md
 */

// `createClient` builds a (not yet connected) Redis client from a connection URL;
// `RedisClientType` is the resulting client's type, needed for the generic below.
import { createClient, type RedisClientType } from 'redis';
import { logger } from '@infrastructure/adapters/logger';
import {
    manageConnection,
    type DependencyStatus
} from '@infrastructure/adapters/managed-connection';
import { environmentFlag } from '@infrastructure/runtime/environment';
import { cacheInvalidationFailuresTotal } from '@infrastructure/observability/metrics-cache';

/**
 * Prefix for every key this app owns. Redis has no namespaces beyond numbered databases, so
 * staging and production need different prefixes or they read each other's cached responses.
 */
const CACHE_PREFIX = process.env.NODE_REDIS_CACHE_PREFIX ?? 'boilerplate-node-backend';

/**
 * Support both a full Redis URI and host/port fragments so deployment config can stay flexible.
 *
 * Returns `undefined` when neither is set — which is the signal that caching is off
 * (see `isCacheEnabled`), not an error.
 */
const getRedisUrl = (): string | undefined => {
    if (process.env.NODE_REDIS_URL) return process.env.NODE_REDIS_URL;
    if (!process.env.NODE_REDIS_PORT) return;

    const host = process.env.NODE_REDIS_HOST ?? '127.0.0.1';
    return `redis://${host}:${process.env.NODE_REDIS_PORT}`;
};

/**
 * Cache usage is on only when Redis is configured and not explicitly disabled — two independent
 * switches, since `NODE_REDIS_CACHE_ENABLED=0` is a kill switch for debugging a stale cache
 * without tearing down Redis itself.
 */
const isCacheEnabled = () =>
    Boolean(getRedisUrl()) && environmentFlag('NODE_REDIS_CACHE_ENABLED', true);

/**
 * The one connection this process opens to Redis — a client per request exhausts Redis' limit.
 * Lifecycle rules (memoise, share in-flight connect, warn once) live in `manageConnection`; only
 * what's Redis-specific is below.
 */
const cacheConnection = manageConnection<RedisClientType>({
    unavailableMessage: 'Redis cache unavailable, continuing without server-side cache.',
    isEnabled: isCacheEnabled,
    // `isReady` (as opposed to `isOpen`) means the socket is up *and* the handshake finished, so
    // commands can be issued immediately. A client that dropped since the last call answers
    // `false` here and is replaced rather than handed back dead.
    isReady: (client) => client.isReady,
    connect: () => {
        const redisUrl = getRedisUrl();
        // Enablement already implies a URL; this is the type narrowing, and resolving `undefined`
        // is the "cannot be built" signal rather than a failure worth warning about.
        if (!redisUrl) return Promise.resolve(undefined);

        const client: RedisClientType = createClient({
            // `redis://[:password@]host:port[/db]` — parsed by node-redis itself.
            url: redisUrl,
            socket: {
                // Fail fast (1s). A cache lookup must never dominate request latency; if Redis
                // is slow to accept connections we would rather serve the request uncached.
                connectTimeout: 1000,
                // `false` disables node-redis' automatic reconnect loop. Deliberate: the loop
                // would retry in the background forever and log on every attempt. Instead each
                // attempt is one clean try, so recovery is driven by traffic.
                reconnectStrategy: false
            }
        });

        // node-redis is an EventEmitter and an unhandled 'error' event would crash the process,
        // so this listener is mandatory, not just for logging.
        client.on('error', cacheConnection.reportUnavailable);

        // A client is built per ATTEMPT rather than kept across failed ones: the handle belongs to
        // the lifecycle, and one that never finished connecting has nothing worth reusing.
        return client.connect().then(() => client);
    },
    close: (client) => {
        // Nothing was ever opened: caching is off, or the last connect failed. Either way there
        // is no socket to release.
        if (!client) return Promise.resolve();

        return (
            client
                // `quit()` sends the QUIT command and waits for queued replies — the polite close.
                .quit()
                .then(
                    () => undefined,
                    // If QUIT itself fails (already-dead socket), `destroy()` drops the socket
                    // immediately, discarding anything still queued.
                    () => client.destroy()
                )
        );
    }
});

/**
 * What this adapter's connection is doing, for `GET /observability/health`.
 *
 * Reads memoised state rather than pinging, so health reports what the next lookup will actually
 * do — see the header of `modules/observability/services/dependency-health.ts` for why a health
 * endpoint does no I/O.
 */
export const cacheState = (): DependencyStatus => cacheConnection.state();

/**
 * Build one namespaced Redis key: `<prefix>:key:<hash>` for a cached value (a Redis string),
 * `<prefix>:tag:<name>` for the keys under a tag (a Redis set).
 */
const prefix = (value: string) => `${CACHE_PREFIX}:${value}`;

/**
 * Warm up Redis during app startup so the first request does not pay the connect cost.
 *
 * Intentionally not awaited by the boot sequence in a blocking way — a missing Redis
 * must not stop the server from listening.
 */
export const startCache = (): Promise<void> => cacheConnection.get().then(() => undefined);

/**
 * Close Redis gracefully and forget the client so a later restart begins from a clean state.
 */
export const stopCache = (): Promise<void> => cacheConnection.stop();

/**
 * Read one cached value from Redis.
 *
 * Resolves `undefined` on a miss, a Redis failure, or when caching is disabled — callers can't
 * tell which. Bytes are returned exactly as written; what they mean is the caller's business.
 */
export const getCacheValue = (key: string): Promise<string | undefined> =>
    cacheConnection
        .get()
        .then((redisClient) => {
            if (!redisClient) return undefined;

            // Redis GET on a string key. Returns `null` when the key is absent or has expired,
            // which is the same answer to the caller as "not cached".
            return redisClient.get(prefix(`key:${key}`)).then((raw) => raw ?? undefined);
        })
        .catch((error: unknown) => {
            logger.warn({
                message: 'Redis cache read failed.',
                key,
                error
            });
            return undefined;
        });

/**
 * Save one value in Redis and attach it to one or more "tags".
 * Tags let us delete groups of cached entries later (example: all "products" cache).
 *
 * @param key - the cache key, namespaced by the caller's own scheme
 * @param value - the bytes to store, already serialized by whoever knows their shape
 * @param ttlSeconds - lifetime; `<= 0` means "do not cache this at all"
 * @param tags - invalidation groups this entry belongs to
 */
export const setCacheValue = (
    key: string,
    value: string,
    ttlSeconds: number,
    tags: string[] = []
): Promise<void> => {
    // Guard: Redis rejects `EX` values of 0 or less, and a zero TTL means "don't cache" anyway.
    if (ttlSeconds <= 0) return Promise.resolve();

    const cacheKey = prefix(`key:${key}`);
    // `filter(Boolean)` drops empty strings, `new Set` de-duplicates — both would otherwise
    // create junk tag keys and redundant SADD round-trips.
    const cacheTags = [...new Set(tags.filter(Boolean))];

    return cacheConnection
        .get()
        .then((redisClient) => {
            if (!redisClient) return;

            // Save the value with a TTL so Redis evicts it automatically later.
            return (
                redisClient
                    .set(cacheKey, value, {
                        // `EX` = expire after N seconds. Redis deletes the key itself, so the cache
                        // is self-trimming and needs no cleanup job.
                        EX: ttlSeconds
                    })
                    .then(() =>
                        // Index this key by tags too — `sAdd`/SADD adds it to each tag's Redis
                        // set, which is what makes group invalidation possible (Redis cannot
                        // delete by pattern efficiently).
                        Promise.all(
                            cacheTags.map((tag) => redisClient.sAdd(prefix(`tag:${tag}`), cacheKey))
                        )
                    )
                    // Collapse the SADD reply counts to void — callers only care that it finished.
                    .then(() => undefined)
            );
        })
        .catch((error: unknown) => {
            logger.warn({
                message: 'Redis cache write failed.',
                key,
                error
            });
        });
};

/**
 * Claim the right to rebuild one stale entry — refresh-ahead's only mechanism.
 *
 * `SET key 1 NX EX seconds`: Redis grants the key to exactly one caller across every worker and
 * replica; every other caller gets `null` back for the same window. https://redis.io/commands/set/
 * (the `NX` + `EX` combination). No lock to release and no waiter: a claim that is never renewed
 * simply expires, and the next reader past `staleAt` claims it instead.
 *
 * @param key - the entry's own cache key; the claim is namespaced under `refresh:` so it never
 *   collides with, or gets deleted alongside, the entry it protects
 * @param seconds - how long the claim stands before another caller may retry the rebuild
 * @returns true for the one caller that won the claim, false for every other — including on any
 *   Redis failure, so a flaky claim never doubles as a signal that a rebuild is in flight
 */
export const claimCacheRefresh = (key: string, seconds: number): Promise<boolean> =>
    cacheConnection
        .get()
        .then((redisClient) => {
            if (!redisClient) return false;

            return redisClient
                .set(prefix(`refresh:${key}`), '1', { NX: true, EX: seconds })
                .then((result) => result === 'OK');
        })
        .catch((error: unknown) => {
            logger.warn({
                message: 'Redis refresh claim failed.',
                key,
                error
            });
            return false;
        });

/**
 * Remove every cached entry linked to the given tags — called after a successful write.
 *
 * No cross-instance broadcast needed: entries live in shared Redis, so one call invalidates them
 * for every worker and replica. `reachable: false` means the pre-write response is still cached
 * and served until its TTL expires — a stale read window, not a crash — so the caller decides
 * what to do with the answer; this never rejects.
 *
 * See: docs/tools/redis-cache.md#why-there-is-no-cross-instance-broadcast
 */
export const invalidateCacheTags = (tags: string[]): Promise<ClearCacheResult> => {
    const cacheTags = [...new Set(tags.filter(Boolean))];
    if (cacheTags.length === 0) return Promise.resolve({ deleted: 0, reachable: true });

    return cacheConnection
        .get()
        .then((redisClient) => {
            // Same split as `clearCache`: caching switched off is trivially clear, caching on with
            // no client is a connect that failed — the lifecycle reports both as void.
            if (!redisClient) return { deleted: 0, reachable: !isCacheEnabled() };

            // For each tag: read its members, delete those keys, then delete the tag set itself.
            return Promise.all(
                cacheTags.map((tag) => {
                    const tagKey = prefix(`tag:${tag}`);
                    return (
                        redisClient
                            // `sMembers` = SMEMBERS, returning every key registered under this tag.
                            .sMembers(tagKey)
                            // `del` accepts an array (variadic DEL) — one round-trip for the whole
                            // group instead of one per key. Guarded because DEL with zero
                            // arguments is a protocol error.
                            .then((keys) => (keys.length > 0 ? redisClient.del(keys) : 0))
                            // Drop the now-meaningless index set as well, so it does not grow
                            // unbounded across invalidation cycles. Its own deletion is not a
                            // cached entry and is not counted.
                            .then((deleted) => redisClient.del(tagKey).then(() => deleted))
                    );
                })
            ).then((perTag) => ({
                deleted: perTag.reduce((total, count) => total + count, 0),
                reachable: true
            }));
        })
        .catch((error: unknown) => {
            logger.warn({
                message: 'Redis cache invalidation failed.',
                tags: cacheTags,
                error
            });
            return { deleted: 0, reachable: false };
        });
};

/**
 * Clears Redis cache groups, and logs plus counts the failure when Redis could not be reached —
 * the shared body behind the HTTP cache middleware's own {@link invalidateCache} and the image
 * digest worker's writeback-completion invalidation (`adapters/image.worker.ts` — a write and the
 * async digest it kicks off are two separate mutations of the same document, and each clears the
 * cache the same way).
 *
 * @param tags - the cache tags to clear, e.g. `['products']`
 * @returns a promise resolving once the attempt, successful or not, is logged
 */
export const invalidateCacheTagsLogged = (tags: string[]): Promise<void> =>
    invalidateCacheTags(tags).then(({ reachable }) => {
        if (reachable) return;
        /*
         * The write (or digest) landed but its cached predecessor did not, so the endpoint serves
         * a stale response until the TTL expires. The response may already be sent, so logging
         * plus a counter — reachable from an alert, not just grep — is the only move left.
         */
        for (const tag of tags) cacheInvalidationFailuresTotal.inc({ tag });
        logger.error({
            message: 'Cache invalidation could not reach Redis; stale responses survive.',
            tags
        });
    });

/**
 * Outcome of a {@link clearCache} call.
 *
 * Two fields rather than a bare count because "0 keys removed" is ambiguous on its own: it is
 * the honest answer for an empty cache *and* the answer a dead Redis produces. Callers that
 * exist to clear the cache need to tell those apart.
 */
export interface ClearCacheResult {
    /** Keys actually removed. Always `0` when `reachable` is false. */
    deleted: number;
    /**
     * Whether the cache is now known to be clear.
     *
     * `false` only when caching is on but Redis is unreachable, so stale entries survive until
     * their TTL expires. `true` covers a completed scan-and-delete, and also caching being off —
     * nothing to reach, nothing to go stale.
     */
    reachable: boolean;
}

/**
 * Delete every key matching a glob pattern, one `DEL` per `SCAN` batch.
 *
 * Split out of `clearCache` so the `for await` loop — and the `if` that skips an empty batch —
 * sit at their own nesting level instead of piling up inside an async function that was itself
 * nested inside the connection's `.then` callback. Same move as `handleDelivery` in `queue.ts`.
 *
 * @param redisClient - live Redis client to scan and delete on
 * @param pattern - glob pattern passed to Redis `SCAN` (`MATCH`)
 * @returns total number of keys deleted across every batch
 */
const drainMatchingKeys = async (
    redisClient: RedisClientType,
    pattern: string
): Promise<number> => {
    let deleted = 0;

    // `scanIterator` yields batches of keys (node-redis v5), so one DEL per batch.
    for await (const keys of redisClient.scanIterator({
        MATCH: pattern,
        COUNT: 100
    })) {
        if (keys.length === 0) continue;
        deleted += await redisClient.del(keys);
    }

    return deleted;
};

/**
 * Delete every cached entry and tag set belonging to this app — the escape hatch for writes
 * that never ran `invalidateCache`. Deliberately NOT `FLUSHALL`: scoped to `<CACHE_PREFIX>:*`,
 * so a shared Redis is untouched, and `SCAN` iterates in batches rather than blocking the server.
 *
 * Never rejects, but reports via `reachable` — fail-open is each caller's own choice.
 *
 * See: docs/tools/redis-cache.md#writes-that-bypass-the-api
 */
export const clearCache = (): Promise<ClearCacheResult> =>
    cacheConnection
        .get()
        .then((redisClient) => {
            if (!redisClient) {
                /*
                 * Two situations land here and the lifecycle can't tell them apart: caching is
                 * off, or it's on and the connect failed. `isCacheEnabled()` is what separates
                 * "nothing to clear" from "could not clear".
                 */
                return { deleted: 0, reachable: !isCacheEnabled() };
            }

            return drainMatchingKeys(redisClient, prefix('*')).then((deleted) => ({
                deleted,
                reachable: true
            }));
        })
        .catch((error: unknown) => {
            // Reached when SCAN or DEL fails mid-drain — the socket died partway through, say.
            // Whatever `deleted` had reached is discarded: the cache is in an unknown state,
            // which is the same verdict as never having connected.
            logger.warn({
                message: 'Redis cache clear failed.',
                error
            });
            return { deleted: 0, reachable: false };
        });
