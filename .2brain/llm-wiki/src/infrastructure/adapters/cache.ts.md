---
source: src/infrastructure/adapters/cache.ts
sha256: 1e5904e72e279674784fb516b57e0615f7d026c07ccad2ee0a03c636c1cc6d36
generated_at: 2026-10-01T12:47:11.989263+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/cache.ts

## Purpose

Redis-backed byte store with tag-based group invalidation. Exposes a small, opaque API (`get`, `set`, `claim`) over a single shared connection. Every operation **fails open**: on any Redis error the function resolves to a neutral value (`undefined`, `false`, `'unavailable'`) so the caller can proceed as if no cache exists. What the bytes represent and how they are framed is entirely the caller's concern.

## Key elements

- **`cacheState()`** – Returns the memoised `DependencyStatus` of the Redis connection for health endpoints. No I/O.
- **`startCache()` / `stopCache()`** – Warm up / tear down the single shared connection. `startCache` is intentionally non-blocking so a missing Redis never delays server listen.
- **`getCacheValue(key)`** – `GET <prefix>:key:<key>`. Resolves `undefined` on miss, error, or cache-disabled; callers cannot distinguish the three.
- **`setCacheValue(key, value, ttlSeconds, tags)`** – `SET <prefix>:key:<key>` with `EX` TTL, then `SADD` into each `<prefix>:tag:<tag>` set. `ttlSeconds <= 0` is a no-op. Tags are deduplicated and empty strings dropped.
- **`indexUnderTag`** (private) – `SADD` + two `EXPIRE` calls (`NX` then `GT`) so a tag set's TTL is always ≥ its newest member's TTL, preventing unbounded set growth.
- **`claimCacheKey(key, seconds)`** – Atomic `SET <prefix>:claim:<key> NX EX seconds`; returns `'claimed' | 'taken' | 'unavailable'`.
- **`claimCacheRefresh(key, seconds)`** – Same `SET NX EX` pattern under `<prefix>:refresh:<key>`; returns `boolean`. Used for refresh-ahead (exactly-one-rebuild) coordination.
- **`isCacheEnabled()`** (private) – Two independent gates: a Redis URL must be configured **and** `NODE_REDIS_CACHE_ENABLED` must be truthy (the latter is a kill-switch for debugging stale entries without dropping Redis).
- **`CACHE_PREFIX`** – Read once from `redisConfig().NODE_REDIS_CACHE_PREFIX`; namespaces all keys so staging and production on shared Redis don't collide.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** – Provides `createRedisClient`, `closeRedisClient`, `configuredRedisUrl`, and the `RedisClient` type. This file is the sole consumer of those helpers.
- **`src/infrastructure/adapters/managed-connection.ts`** – Supplies the `manageConnection` lifecycle wrapper (memoise, shared in-flight connect, warn-once) and the `DependencyStatus` type.
- **`src/infrastructure/adapters/config.ts`** – Source of `redisConfig()` (`NODE_REDIS_CACHE_PREFIX`, `NODE_REDIS_CACHE_ENABLED`).
- **`src/infrastructure/adapters/logger.ts`** – Structured warning logs on every fail-open catch.
- **`src/infrastructure/observability/metrics-cache.ts`** – Exports `cacheInvalidationFailuresTotal`, imported here (presumably incremented in the truncated invalidation path).
- **`src/infrastructure/http/middlewares/cache.ts`** – Primary caller: reads/writes HTTP response bodies through `getCacheValue` / `setCacheValue` / `claimCacheRefresh`.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – Likely uses `claimCacheKey` or `setCacheValue` for per-window rate-limit state.
- **`src/infrastructure/adapters/antibot-providers/altcha-store.ts`** – Likely uses `claimCacheKey` for one-time challenge tracking.
- **`src/app.ts`** – Calls `startCache` / `stopCache` during process lifecycle.
- **`scripts/db/cache-clear.ts`** – Operational script that flushes keys under this module's prefix.

## Notes

- **Fail-open is by design, not an oversight.** Catch blocks resolve to neutral values and log a warning; they never reject. Stryker mutation suppression (`// Stryker disable all`) wraps these blocks to prevent the mutation tester from "fixing" them.
- **No cross-instance broadcast for invalidation.** Because all replicas share the same Redis, a single `DEL`/`SREM` call removes the entry for everyone.
- **Key namespace scheme is fixed:** `<prefix>:key:<key>`, `<prefix>:tag:<name>`, `<prefix>:claim:<key>`, `<prefix>:refresh:<key>`. Any consumer building keys manually must follow this or it will silently read foreign data.
- **`isReady` vs `isOpen`:** the connection manager checks `client.isReady` (handshake complete), not just `isOpen`, so a half-connected client is discarded and re-created rather than returned to callers.
- **`ttlSeconds <= 0` is the "skip caching" signal**, not an error; `setCacheValue` resolves immediately without touching Redis.
