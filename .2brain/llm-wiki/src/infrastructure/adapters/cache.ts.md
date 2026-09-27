---
source: src/infrastructure/adapters/cache.ts
sha256: c0c430993c258f2eed5d5f2c776f3e69ab1b1b200aa7251f86a3e2622c1cab51
generated_at: 2026-09-27T14:05:04.265797+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/cache.ts

## Purpose

Redis cache adapter exposing an opaque byte store with tag-based invalidation. Every operation fails open — if Redis is unreachable the app continues serving without a cache rather than erroring. The module owns connection lifecycle, key namespacing, and tag indexing; what gets cached and how values are framed is the caller's responsibility.

## Key elements

- **`cacheConnection`** (module-private) — single shared `RedisClient` managed via `manageConnection`; memoised, in-flight-connect-safe, and replaced if the socket drops.
- **`isCacheEnabled()`** — true only when a Redis URL is resolvable **and** the `NODE_REDIS_CACHE_ENABLED` flag is not explicitly `0` (kill switch for stale-cache debugging).
- **`CACHE_PREFIX`** — namespacing prefix (default `boilerplate-node-backend`) so staging/prod don't read each other's keys.
- **`startCache()` / `stopCache()`** (exported) — warm-up and graceful shutdown; startup is intentionally non-blocking so a missing Redis never prevents the server from listening.
- **`cacheState()`** (exported) — returns `DependencyStatus` for `/observability/health`; reads memoised state, performs no I/O.
- **`getCacheValue(key)`** (exported) — reads one namespaced string; resolves `undefined` on miss, failure, or disabled cache (callers can't distinguish).
- **`setCacheValue(key, value, ttlSeconds, tags)`** (exported) — writes with `EX` TTL and indexes the key under each tag's Redis set; `ttlSeconds <= 0` is a no-op.
- **`indexUnderTag()`** (private) — `SADD` + `EXPIRE NX` + `EXPIRE GT` so a tag set never outlives its newest member.
- **`claimCacheKey(key, seconds)`** (exported) — distributed one-shot claim via `SET NX EX`; returns `'claimed' | 'taken' | 'unavailable'`.
- **`claimCacheRefresh(key, seconds)`** (exported) — refresh-ahead lock under `refresh:` namespace; returns `boolean`, `false` on any failure so a flaky claim never looks like an in-flight rebuild.
- **Tag invalidation** (exported, truncated in source) — deletes all entries linked to given tags and increments `cacheInvalidationFailuresTotal` on error.

## Relationships

- **`src/infrastructure/adapters/managed-connection.ts`** — provides `manageConnection` and `DependencyStatus`; this file supplies the Redis-specific `connect`, `close`, `isReady`, and `isEnabled` callbacks.
- **`src/infrastructure/adapters/redis.ts`** — provides `createRedisClient`, `closeRedisClient`, `redisUrlFromHostPort`, and the `RedisClient` type used throughout.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is called in every `.catch` to surface Redis failures without crashing.
- **`src/infrastructure/runtime/environment.ts`** — `environmentFlag` reads the `NODE_REDIS_CACHE_ENABLED` kill switch.
- **`src/infrastructure/observability/metrics-cache.ts`** — `cacheInvalidationFailuresTotal` counter is incremented on tag-invalidation errors.
- **`src/infrastructure/http/middlewares/cache.ts`** — primary consumer; calls `getCacheValue` / `setCacheValue` / `claimCacheRefresh` for HTTP response caching.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — orchestrates `startCache()` on boot and `stopCache()` on shutdown.
- **`src/app.ts`** — wires `startCache` / `stopCache` into the application lifecycle.

## Notes

- **Fail-open is a contract, not a suggestion.** Every exported read/write resolves a safe default (`undefined` / `void` / `false`) on any Redis error. Callers must not treat a resolved value as proof the cache hit.
- **`claimCacheKey` vs `claimCacheRefresh`** — same `SET NX EX` mechanism, different namespaces (`claim:` vs `refresh:`). The refresh claim never collides with the entry it protects.
- **Tag sets are self-expiring.** Two `EXPIRE` calls (`NX` then `GT`, Redis 7+) ensure the set's TTL tracks its newest member; no cleanup job is needed.
- **Unconditional `client.on('error', …)`** — node-redis is an EventEmitter; without this listener an unhandled `'error'` event would crash the process. It is attached per connect attempt, not once.
- **`Stryker disable/restore` comments** around every `logger.warn` — mutation-testing suppression so dead catch-branch warnings aren't flagged as mutants.
