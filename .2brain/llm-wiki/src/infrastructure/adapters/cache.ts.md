---
source: src/infrastructure/adapters/cache.ts
sha256: 1b8c6dd2938818d694bad33e56fea006fdaa6ce4f7c0c2d25e1bc4cda64e61dd
generated_at: 2026-10-29T01:52:57.117381+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/cache.ts

## Purpose

Redis cache adapter that exposes an opaque byte store with tag-based invalidation. It owns exactly one Redis connection per process, and every public function fails open—returning `undefined`/`false` instead of throwing—so the app keeps serving when Redis is unreachable. What gets cached and how it is framed is deliberately the caller's concern, not this module's.

## Key elements

- **`startCache()` / `stopCache()`** – Warm up (or tear down) the single Redis connection during server lifecycle. `startCache` is not meant to be awaited in a blocking way; a missing Redis must not prevent the server from listening.
- **`getCacheValue(key)`** – Read one entry. Resolves `undefined` on a miss, a Redis failure, or when caching is disabled; callers cannot distinguish the three.
- **`setCacheValue(key, value, ttlSeconds, tags?)`** – Write a value with a TTL (`EX`) and index it under one or more tags. A `ttlSeconds <= 0` is a no-op ("don't cache"). Tags are stored as Redis sorted sets scored by epoch-ms expiry.
- **`claimCacheRefresh(key, seconds)`** – Atomic refresh-ahead lock via `SET … NX EX`. Returns `true` for the one caller that wins the claim, `false` for all others (including on Redis failure).
- **`invalidateCacheTags(tags)`** – Delete every entry linked to the given tags by scanning each tag's sorted set. Returns a `ClearCacheResult` with `deleted` count and a `reachable` flag; never rejects.
- **`cacheState()`** – Returns a `DependencyStatus` for the health endpoint by reading the memoised connection state (no I/O).
- **`cacheConnection`** (module-private) – A `manageConnection<RedisClient>` instance that memoises the client, shares in-flight connects, and reports unavailability once. Uses `isReady` (handshake complete) rather than `isOpen` to reject a dropped client.
- **`indexUnderTag`** (module-private) – Maintains a per-tag sorted set: prunes expired members (`ZREMRANGEBYSCORE`), adds the new member (`ZADD`), then applies `EXPIRE … NX` and `EXPIRE … GT` so the index TTL tracks its newest member.
- **`isCacheEnabled` / `cachePrefix`** (module-private) – Two independent switches: a Redis URL must be configured **and** `NODE_REDIS_CACHE_ENABLED` must be truthy. The prefix (`NODE_REDIS_CACHE_PREFIX`) namespaces all keys so staging and production don't read each other's data.

## Relationships

- **`@infrastructure/adapters/redis`** – Provides `createRedisClient`, `closeRedisClient`, `configuredRedisUrl`, and the `RedisClient` type that this adapter wraps.
- **`@infrastructure/adapters/managed-connection`** – Supplies the `manageConnection` helper and `DependencyStatus` type used for the single-connection lifecycle and health reporting.
- **`@infrastructure/adapters/config`** – Source of `redisConfig()` for the cache prefix and enable flag.
- **`@infrastructure/adapters/logger`** – All failure paths log a `warn` through this.
- **`@infrastructure/observability/metrics-cache`** – Imports `cacheInvalidationFailuresTotal` to record invalidation-failure metrics.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – Expected caller of `startCache`/`stopCache` during boot and shutdown.
- **`src/infrastructure/http/middlewares/cache.ts`** – Primary consumer of `getCacheValue`, `setCacheValue`, `claimCacheRefresh`, and `invalidateCacheTags` for HTTP response caching.
- **`scripts/db/cache-clear.ts`** – Script that exercises the tag-invalidation path.

## Notes

- **Fails open, always.** No public function rejects. A Redis outage degrades to "no cache," not an error. Callers must handle `undefined` from reads and `false` from claims without assuming a Redis failure.
- **`ttlSeconds <= 0` is a silent no-op**, not an error—use it to skip caching conditionally.
- **Tag indexes are sorted sets, not plain sets.** A plain set would accumulate expired members indefinitely. The sorted-set + `ZREMRANGEBYSCORE` pattern self-prunes on every write.
- **Two `EXPIRE` calls (`NX` then `GT`) per tag index** because neither mode alone covers both the "no TTL yet" and "shorter TTL already set" cases. Requires Redis 7+.
- **`refresh:` key prefix** isolates refresh claims from entry keys so invalidation of tags never accidentally deletes an in-flight claim.
- **Stryker `disable`/`restore`** comments wrap every `logger.warn` call in the `.catch` paths—mutants there are intentionally suppressed.
- The `error` event listener on the Redis client is mandatory (not optional logging): node-redis is an `EventEmitter` and an unhandled `error` event crashes the process.
