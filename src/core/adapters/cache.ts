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
import type { ICacheTagsInvalidatedPayload } from '@types';
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
 * Save one HTTP response in Redis and attach it to one or more "tags".
 * Tags let us delete groups of cached responses later (example: all "products" cache).
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
                    .set(cacheKey, JSON.stringify(value), {
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

// ─── Pub/Sub: cross-instance cache invalidation ───────────────────────────────
//
// Why this section exists: the *cached data* is shared (one Redis), but each app instance
// also holds process-local state and, more importantly, only the instance that handled a
// write knows something changed. Broadcasting the invalidation lets every replica react.

/*
 * Redis pub/sub channel name (matches asyncapi.yaml)
 * Kept in sync with the AsyncAPI contract so the channel is documented alongside the
 * HTTP API rather than living only in code.
 */
const CACHE_INVALIDATION_CHANNEL = 'cache.tags.invalidated';

/*
 * Unique instance ID to avoid processing own broadcasts
 * Composed of pid + boot timestamp + random suffix: pid alone collides across containers
 * (each gets its own pid namespace), and pid+timestamp can collide when replicas start
 * simultaneously from the same image.
 */
const INSTANCE_ID = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/*
 * Separate subscriber client (Redis requires a dedicated connection for subscriptions)
 * A connection in subscribe mode accepts only (un)subscribe commands, so reusing the main
 * `client` here would break every GET/SET in this file.
 */
let subscriberClient: RedisClientType | undefined;

/**
 * Publish a cache invalidation event so other app instances can evict stale entries.
 *
 * Note this only *notifies*; the calling instance still invalidates locally via
 * `invalidateCacheTags`. Fire-and-forget — a failed broadcast means peers keep a stale
 * entry until its TTL expires, which is acceptable degradation.
 */
export const broadcastCacheInvalidation = (tags: string[]): Promise<void> => {
    if (!isCacheEnabled() || tags.length === 0) return Promise.resolve();

    // Shape defined in `@types` and mirrored in asyncapi.yaml.
    const payload: ICacheTagsInvalidatedPayload = {
        tags,
        // Lets receivers discard their own echo (Redis delivers to all subscribers).
        origin: INSTANCE_ID,
        // Diagnostic only — useful when tracing propagation lag between replicas.
        timestamp: new Date().toISOString()
    };

    return getClient()
        .then((redisClient) => {
            if (!redisClient) return;
            // `publish` = PUBLISH: at-most-once delivery with no persistence. Subscribers that
            // are down at this moment simply never see the message — which is why TTLs remain
            // the real correctness backstop.
            return redisClient.publish(CACHE_INVALIDATION_CHANNEL, JSON.stringify(payload));
        })
        .then(() => {})
        .catch((error) => {
            logger.warn({
                message: 'Redis cache invalidation broadcast failed.',
                error: error instanceof Error ? error.message : String(error)
            });
        });
};

/**
 * Subscribe to cache invalidation broadcasts from other instances.
 * Call once during app startup.
 */
export const subscribeCacheInvalidation = (): Promise<void> => {
    if (!isCacheEnabled()) return Promise.resolve();

    const redisUrl = getRedisUrl();
    if (!redisUrl) return Promise.resolve();

    // Same socket options as the main client: fail fast, no background reconnect loop.
    subscriberClient = createClient({
        url: redisUrl,
        socket: { connectTimeout: 1000, reconnectStrategy: false }
    });

    // Required listener (an unhandled 'error' event would crash the process). Silent here
    // because `getClient()` already reports Redis health via `logConnectionWarning`.
    subscriberClient.on('error', () => {});

    return subscriberClient
        .connect()
        .then(() =>
            // Non-null assertion: `subscriberClient` was just assigned above, but TypeScript
            // cannot prove a module-level `let` is unchanged across the promise boundary.
            // `subscribe(channel, listener)` registers a per-channel callback (node-redis v4+)
            // instead of the older global 'message' event.
            subscriberClient!.subscribe(CACHE_INVALIDATION_CHANNEL, (message) => {
                try {
                    const payload = JSON.parse(message) as ICacheTagsInvalidatedPayload;
                    // Skip events from this instance (already applied locally).
                    // Without this check the publisher would re-run its own invalidation and,
                    // worse, delete the fresh entries it may have just written.
                    if (payload.origin === INSTANCE_ID) return;
                    // `void`: the listener is sync, so the invalidation is deliberately floating.
                    void invalidateCacheTags(payload.tags);
                } catch {
                    // Malformed JSON — most likely another app publishing on the same channel
                    // with a different prefix. Log and drop; never throw inside a listener.
                    logger.warn({ message: 'Malformed cache invalidation message received.' });
                }
            })
        )
        .then(() => {
            logger.info('Redis cache invalidation subscriber active.');
        })
        .catch((error) => {
            logger.warn({
                message: 'Redis cache invalidation subscriber failed.',
                error: error instanceof Error ? error.message : String(error)
            });
        });
};

/*
 * Stop the subscriber client during graceful shutdown
 * Runs *before* `stopCache()` in the shutdown chain (see bootstrap/server-lifecycle.ts):
 * an open subscription would otherwise keep receiving events and issuing DEL commands
 * against a client that is being torn down.
 */
export const stopCacheSubscriber = (): Promise<void> => {
    if (!subscriberClient?.isOpen) return Promise.resolve();
    return (
        subscriberClient
            // Graceful close; falls back to a hard socket drop if QUIT fails.
            .quit()
            .then(() => {})
            .catch(() => subscriberClient!.disconnect())
            .finally(() => {
                subscriberClient = undefined;
            })
    );
};
