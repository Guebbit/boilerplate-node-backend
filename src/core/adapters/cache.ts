/**
 * Redis cache adapter.
 *
 * Every function here *fails open*: if Redis is unreachable the app keeps serving requests
 * without a cache rather than returning errors. A cache is an optimisation, never a dependency.
 *
 * See: docs/tools/redis-cache.md
 */

// `createClient` builds a (not yet connected) Redis client from a connection URL;
// `RedisClientType` is the resulting client's type, needed for the module-level `let` below.
import { createClient, type RedisClientType } from 'redis';
import { logger } from '@core/adapters/logger';

/**
 * Redis = a very fast in-memory data store.
 * Here we use it as a shared cache, so repeated GET requests can be served faster.
 *
 * What we store per key: enough to replay an HTTP response verbatim — the status code
 * and the already-serialized body.
 */
type CacheValue = {
    status: number;
    body: unknown;
};

/**
 * Prefix all Redis keys so this app does not collide with other apps/environments.
 *
 * Redis has no namespaces beyond numbered databases, so prefixing is the conventional
 * isolation mechanism. Give staging and production different prefixes (or different
 * instances) or they will read each other's cached responses.
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
 * Hold the shared Redis client instance.
 *
 * One TCP connection (with its own internal pool) per process. Creating a client per request
 * would exhaust Redis' connection limit almost immediately under load.
 */
let client: RedisClientType | undefined;

/**
 * Hold the in-flight connect promise so parallel requests reuse the same connection attempt.
 *
 * Without this, a burst of requests arriving during startup would each fire their own
 * `connect()` — the classic thundering-herd on a cold cache.
 */
let connectPromise: Promise<RedisClientType | void> | undefined;

/**
 * Avoid logging the same "Redis is down" warning again and again.
 *
 * The client emits `error` on every failed operation, so an unreachable Redis would
 * otherwise produce one log line per request. Reset to `false` on a successful connect
 * so a *later* outage is still reported.
 */
let connectionWarningLogged = false;

/**
 * Turn cache usage on only when Redis is configured and not explicitly disabled.
 *
 * Two independent switches: no URL means "not available", while `NODE_REDIS_CACHE_ENABLED=0`
 * is an explicit kill switch — useful for debugging a suspected stale-cache problem in
 * production without tearing down the Redis service itself.
 */
const isCacheEnabled = () => Boolean(getRedisUrl()) && process.env.NODE_REDIS_CACHE_ENABLED !== '0';

/**
 * Longest TTL allowed outside production, in seconds.
 *
 * Cache invalidation only fires for writes that go *through the API*. Anything that writes
 * straight to Mongo — `db:seed`, a migration, a `mongosh` session — leaves the cache serving
 * the old answer until it expires on its own. A 3600s route TTL therefore means "up to an hour
 * of visibly wrong data" the first time you touch the database by hand.
 *
 * Capping the TTL in dev bounds the damage from *every* such writer, including the ones nobody
 * has thought of yet, at the cost of fewer cache hits while developing. The caching layer still
 * demonstrably works — you just stop losing an afternoon to it. Production keeps the route's
 * declared TTL, because there the API is the only writer.
 *
 * Set `NODE_REDIS_CACHE_DEV_TTL_MAX=0` to disable the cap and use the declared TTLs everywhere.
 */
const DEFAULT_DEV_TTL_MAX_SECONDS = 30;

const getDevelopmentTtlMax = (): number => {
    const raw = process.env.NODE_REDIS_CACHE_DEV_TTL_MAX;
    if (raw === undefined || raw.trim() === '') return DEFAULT_DEV_TTL_MAX_SECONDS;

    const parsed = Number(raw);
    // A non-numeric or negative value is a config typo; fall back rather than cache forever.
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_DEV_TTL_MAX_SECONDS;
};

/**
 * Clamp a route's declared TTL to the development ceiling.
 *
 * Applied where the TTL enters the system (the `setCache` middleware) rather than at write
 * time, so the `Cache-Control: max-age` header advertises the same lifetime the server will
 * actually honour.
 *
 * @param seconds - TTL declared by the route
 * @returns the TTL to use, capped outside production
 */
export const resolveCacheTtl = (seconds: number): number => {
    if (process.env.NODE_ENV === 'production') return seconds;

    const max = getDevelopmentTtlMax();
    if (max <= 0) return seconds;
    return Math.min(seconds, max);
};

/**
 * Build one namespaced Redis key.
 *
 * Callers pass a sub-namespace, giving the two key families used here:
 *   `<prefix>:key:<hash>` → a cached response      (a Redis string)
 *   `<prefix>:tag:<name>` → the keys under a tag   (a Redis set)
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
    // Disabled → resolve with nothing. Every caller treats a void result as "skip the cache".
    if (!isCacheEnabled()) return Promise.resolve();
    // `isReady` (as opposed to `isOpen`) means the socket is up *and* the handshake finished,
    // so commands can be issued immediately.
    if (client?.isReady) return Promise.resolve(client);
    // A connect is already in flight — join it instead of starting a second one.
    if (connectPromise) return connectPromise;

    // Create the client only once, then reuse it for the rest of the app lifetime.
    if (!client) {
        const redisUrl = getRedisUrl();
        if (!redisUrl) return Promise.resolve();

        client = createClient({
            // `redis://[:password@]host:port[/db]` — parsed by node-redis itself.
            url: redisUrl,
            socket: {
                // Fail fast (1s). A cache lookup must never dominate request latency; if Redis
                // is slow to accept connections we would rather serve the request uncached.
                connectTimeout: 1000,
                // `false` disables node-redis' automatic reconnect loop. Deliberate: the loop
                // would retry in the background forever and log on every attempt. Instead each
                // `getClient()` call gets one clean attempt, so recovery is driven by traffic.
                reconnectStrategy: false
            }
        });

        // node-redis is an EventEmitter and an unhandled 'error' event would crash the process,
        // so this listener is mandatory, not just for logging.
        client.on('error', logConnectionWarning);
    }

    // Local alias so the closures below capture a non-undefined reference: `client` is a
    // module-level `let` that `stopCache()` can clear while this promise is still pending.
    const redisClient = client;

    const promise: Promise<RedisClientType | void> = redisClient
        .connect()
        .then(() => {
            // If connect worked, allow future warnings again for later failures.
            connectionWarningLogged = false;
            return redisClient;
        })
        .catch((error: unknown) => {
            // Resolve (not reject) with void: connection failure is a cache miss, not a request failure.
            logConnectionWarning(error);
            return;
        })
        .finally(() => {
            // Clear the in-flight marker either way, so the *next* call can retry a dead Redis.
            connectPromise = undefined;
        });

    connectPromise = promise;

    return connectPromise;
};

/**
 * Warm up Redis during app startup so the first request does not pay the connect cost.
 *
 * Intentionally not awaited by the boot sequence in a blocking way — a missing Redis
 * must not stop the server from listening.
 */
export const startCache = () => getClient();

/**
 * Close Redis gracefully and forget the cached client so a later restart begins from a clean state.
 */
export const stopCache = (): Promise<void> => {
    const redisClient = client;
    // `isOpen` covers connecting/connected; nothing to close otherwise.
    if (!redisClient || !redisClient.isOpen) return Promise.resolve();

    return (
        redisClient
            // `quit()` sends the QUIT command and waits for queued replies — the polite close.
            .quit()
            .then(
                () => {},
                // If QUIT itself fails (already-dead socket), `disconnect()` drops the socket
                // immediately, discarding anything still queued.
                () => redisClient.disconnect()
            )
            .finally(() => {
                // Reset module state so a subsequent `getClient()` (e.g. in a test that restarts
                // the app in-process) builds a fresh client instead of reusing a closed one.
                connectPromise = undefined;
                client = undefined;
            })
    );
};

/**
 * Read one cached HTTP response from Redis.
 *
 * Resolves with `undefined` on a miss, on a Redis failure, and when caching is disabled —
 * the caller cannot distinguish them, and does not need to.
 */
export const getCacheValue = (key: string): Promise<CacheValue | void> =>
    getClient()
        .then((redisClient) => {
            if (!redisClient) return;

            // Redis GET on a string key. Returns `null` when the key is absent or has expired.
            return redisClient.get(prefix(`key:${key}`)).then((raw) => {
                if (!raw) return;
                // Redis stores bytes, so the envelope was JSON-serialized on write.
                // A throw here (corrupt value) is caught by the `.catch` below → treated as a miss.
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
 * Largest response body this cache will store, in bytes.
 *
 * A cache turns a cheap request into long-lived server state, which is a different risk from
 * simply answering it: `GET /products` is public, its responses are held for an hour, and the key
 * includes the full URL — so an unauthenticated caller can mint a distinct entry per query string
 * and keep every one of them resident. Bounding the *entry* is what keeps that from being an
 * amplifier, independently of whatever page size the request layer happens to allow.
 *
 * 256 KB leaves generous room for a full page of results (a hundred products serialize to roughly
 * 50 KB) while refusing anything that could only have come from an endpoint returning far more
 * than a page.
 */
const DEFAULT_MAX_CACHED_BYTES = 256 * 1024;

const getMaxCachedBytes = (): number =>
    Number(process.env.NODE_REDIS_CACHE_MAX_BYTES) || DEFAULT_MAX_CACHED_BYTES;

/**
 * Save one HTTP response in Redis and attach it to one or more "tags".
 * Tags let us delete groups of cached responses later (example: all "products" cache).
 *
 * Oversized bodies are skipped rather than stored — see `DEFAULT_MAX_CACHED_BYTES`. Skipping is
 * not a failure: the caller still gets its response, it just will not be replayed from cache, so
 * the endpoint stays correct and only loses an optimisation.
 *
 * @param key - the cache key (typically derived from method + URL + auth scope)
 * @param value - status + body envelope to replay on a later hit
 * @param ttlSeconds - lifetime; `<= 0` means "do not cache this at all"
 * @param tags - invalidation groups this entry belongs to
 */
export const setCacheValue = (
    key: string,
    value: CacheValue,
    ttlSeconds: number,
    tags: string[] = []
): Promise<void> => {
    // Guard: Redis rejects `EX` values of 0 or less, and a zero TTL means "don't cache" anyway.
    if (ttlSeconds <= 0) return Promise.resolve();

    // Serialized once, here, so the size check measures exactly what would be written rather
    // than an estimate of it.
    const payload = JSON.stringify(value);
    const maxCachedBytes = getMaxCachedBytes();
    if (Buffer.byteLength(payload) > maxCachedBytes) {
        // Logged rather than silent: an endpoint that never caches is worth noticing, and the
        // usual cause is a response that grew past what its page size was supposed to bound.
        logger.warn({
            message: 'Redis cache write skipped: response larger than the per-entry limit.',
            key,
            bytes: Buffer.byteLength(payload),
            maxCachedBytes
        });
        return Promise.resolve();
    }

    const cacheKey = prefix(`key:${key}`);
    // `filter(Boolean)` drops empty strings, `new Set` de-duplicates — both would otherwise
    // create junk tag keys and redundant SADD round-trips.
    const cacheTags = [...new Set(tags.filter(Boolean))];

    return getClient()
        .then((redisClient) => {
            if (!redisClient) return;

            // Save the response body with a TTL so Redis evicts it automatically later.
            return (
                redisClient
                    .set(cacheKey, payload, {
                        // `EX` = expire after N seconds. Redis deletes the key itself, so the cache
                        // is self-trimming and needs no cleanup job.
                        EX: ttlSeconds
                    })
                    .then(() =>
                        // Also index this key by tags so future writes can invalidate related reads.
                        // `sAdd` = SADD, adding the key to each tag's Redis set (idempotent by nature
                        // of sets). This reverse index is what makes group invalidation possible:
                        // Redis cannot delete "all keys matching a pattern" efficiently.
                        // NOTE: the tag sets carry no TTL of their own, so they accumulate references
                        // to expired keys until `invalidateCacheTags` clears them — harmless, since
                        // deleting an already-expired key is a no-op.
                        Promise.all(
                            cacheTags.map((tag) => redisClient.sAdd(prefix(`tag:${tag}`), cacheKey))
                        )
                    )
                    // Collapse the SADD reply counts to void — callers only care that it finished.
                    .then(() => {})
            );
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
 *
 * Like `clearCache`, this needs no cross-instance broadcast: the entries and their tag sets
 * live in shared Redis, so one call invalidates them for every worker and every replica. The
 * next read on any instance misses and re-renders from Mongo. A pub/sub fan-out would only
 * become necessary if an instance ever kept a process-local (L1) copy in front of Redis —
 * there is no such tier, and if one is added the broadcast belongs in the same commit as it.
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
                    return (
                        redisClient
                            // `sMembers` = SMEMBERS, returning every key registered under this tag.
                            .sMembers(tagKey)
                            // `del` accepts an array (variadic DEL) — one round-trip for the whole
                            // group instead of one per key. Guarded because DEL with zero
                            // arguments is a protocol error.
                            .then((keys) => (keys.length > 0 ? redisClient.del(keys) : undefined))
                            // Drop the now-meaningless index set as well, so it does not grow
                            // unbounded across invalidation cycles.
                            .then(() => redisClient.del(tagKey))
                    );
                })
                // Collapse the per-tag delete counts to void.
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

/**
 * Outcome of a {@link clearCache} call.
 *
 * Two fields rather than a bare count because "0 keys removed" is ambiguous on its own: it is
 * the honest answer for an empty cache *and* the answer a dead Redis produces. Callers that
 * exist to clear the cache need to tell those apart.
 */
export interface IClearCacheResult {
    /** Keys actually removed. Always `0` when `reachable` is false. */
    deleted: number;
    /**
     * Whether the cache is now known to be clear.
     *
     * `false` in exactly one case: caching is switched on but Redis could not be reached, so
     * stale entries survive the call and will be served until their TTL expires. `true` when
     * the scan-and-delete ran, and also when caching is disabled — there is nothing to reach
     * and nothing cached to go stale, which makes "clear" trivially true.
     */
    reachable: boolean;
}

/**
 * Delete every cached response and tag set belonging to this app.
 *
 * The escape hatch for writes that bypass the API entirely — `db:seed`, `migrate-mongo`, a
 * manual `mongosh` edit. Those change Mongo without ever running `invalidateCache`, so the
 * cached answers survive them; this drops the lot.
 *
 * Deliberately **not** `FLUSHALL`: the delete is scoped to `<CACHE_PREFIX>:*`, so a Redis
 * instance shared with another app (or another environment using a different prefix) is
 * untouched. `SCAN` iterates in small batches instead of blocking the server the way `KEYS`
 * would on a large keyspace.
 *
 * Because the keys live in shared Redis, one call clears the cache for every app instance —
 * no pub/sub broadcast needed.
 *
 * Still fails open — it never rejects — but it now *reports* the failure instead of hiding it,
 * so fail-open is a choice each caller makes rather than one baked in here. `db:seed` ignores
 * `reachable` on purpose (§9: an unreachable Redis must not break seeding); `db:cache:clear`
 * exits non-zero on it, because clearing the cache is the entire job.
 */
export const clearCache = (): Promise<IClearCacheResult> =>
    getClient()
        .then((redisClient) => {
            if (!redisClient) {
                /*
                 * Two different situations land here, and `getClient()` cannot distinguish them
                 * for us: caching is switched off, or it is on and the connect failed —
                 * `getClient()` reports that by resolving void rather than rejecting, which is
                 * why the `.catch` below never sees a connection error. `isCacheEnabled()` is
                 * what separates "nothing to clear" from "could not clear".
                 */
                return { deleted: 0, reachable: !isCacheEnabled() };
            }

            const pattern = prefix('*');
            let deleted = 0;

            // `scanIterator` yields batches of keys (node-redis v5), so one DEL per batch.
            const drain = async () => {
                for await (const keys of redisClient.scanIterator({
                    MATCH: pattern,
                    COUNT: 100
                })) {
                    if (keys.length === 0) continue;
                    deleted += await redisClient.del(keys);
                }
                return { deleted, reachable: true };
            };

            return drain();
        })
        .catch((error) => {
            // Reached when SCAN or DEL fails mid-drain — the socket died partway through, say.
            // Whatever `deleted` had reached is discarded: the cache is in an unknown state,
            // which is the same verdict as never having connected.
            logger.warn({
                message: 'Redis cache clear failed.',
                error: error instanceof Error ? error.message : String(error)
            });
            return { deleted: 0, reachable: false };
        });
