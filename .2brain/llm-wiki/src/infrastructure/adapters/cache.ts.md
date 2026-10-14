---
source: src/infrastructure/adapters/cache.ts
sha256: 19abead28b0559ad0917dc9c3bbd711e4886df35810fbfb5e29fa48568ffb04b
generated_at: 2026-10-14T07:42:06.046065+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/cache.ts

## Purpose

A thin Redis cache adapter that exposes an opaque byte store with tag-based invalidation. Every operation fails open: if Redis is unreachable or caching is disabled, callers receive `undefined`/`false` and the app continues without a server-side cache. What gets cached, how it is serialized, and how responses are framed is entirely the caller's responsibility.

## Key elements

- **`cacheConnection`** — the single, memoised Redis connection for the process, built via `manageConnection`. One client is shared across all operations; a dead client is replaced on the next `get()` call.
- **`startCache()` / `stopCache()`** — warm-up and graceful shutdown of the Redis connection. `startCache` is intentionally non-blocking at boot.
- **`cacheState()`** — returns the memoised `DependencyStatus` for the health endpoint; performs no I/O.
- **`getCacheValue(key)`** — reads one entry. Resolves `undefined` on miss, Redis failure, or disabled cache; callers cannot distinguish these cases.
- **`setCacheValue(key, value, ttlSeconds, tags)`** — writes a value with `EX`-based TTL and indexes it under each tag's sorted set. `ttlSeconds <= 0` is a no-op ("do not cache").
- **`indexUnderTag()`** (internal) — adds a key to a tag's sorted set scored by expiry (epoch ms), prunes already-expired members first, and applies a double `EXPIRE` (`NX` then `GT`) to keep the tag key alive.
- **`claimCacheRefresh(key, seconds)`** — atomic single-writer claim via `SET NX EX` under a `refresh:` sub-prefix; returns `true` for the one caller that won, `false` otherwise (including on Redis failure).
- **`invalidateCacheTags(tags)`** — deletes all entries and their tag indexes for the given tags. Never rejects; reports `{ deleted, reachable }`.
- **`isCacheEnabled()`** — true only when a Redis URL is configured **and** `NODE_REDIS_CACHE_ENABLED` is set; the flag is an independent kill switch.
- **`cachePrefix()`** — namespacing prefix from `redisConfig().NODE_REDIS_CACHE_PREFIX`; staging and prod must use different values.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — provides `createRedisClient`, `closeRedisClient`, `configuredRedisUrl`, and the `RedisClient` type that this adapter wraps.
- **`src/infrastructure/adapters/managed-connection.ts`** — supplies `manageConnection` (memoise, share in-flight connect, warn-once) and the `DependencyStatus` type; this file's `cacheConnection` is a concrete instance of that pattern.
- **`src/infrastructure/adapters/config.ts`** — source of `redisConfig()` for the cache prefix and `NODE_REDIS_CACHE_ENABLED` flag.
- **`src/infrastructure/adapters/logger.ts`** — `logger.warn` is the only error-surfacing path (fail-open means no exceptions propagate to callers).
- **`src/infrastructure/observability/metrics-cache.ts`** — provides `cacheInvalidationFailuresTotal`, incremented when `invalidateCacheTags` cannot reach Redis.
- **`src/infrastructure/http/middlewares/cache.ts`** — the primary consumer; reads/writes HTTP responses through this adapter.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — calls `startCache` / `stopCache` during process start and shutdown.
- **`scripts/db/cache-clear.ts`** — CLI script that calls `invalidateCacheTags` to bulk-purge entries.
- **`scenarios/apply.ts`** / **`scenarios/support/demo.ts`** — exercise the adapter in test/demo scenarios.

## Notes

- **Fail-open is unconditional.** No exported function ever rejects. `getCacheValue` returns `undefined`, `setCacheValue` resolves, `claimCacheRefresh` returns `false`, `invalidateCacheTags` resolves with `reachable: false`. Callers must treat "no cache" as a normal outcome.
- **Tag indexes are sorted sets, not plain sets.** Members are scored by their own expiry (epoch ms). On every `zAdd`, expired members are pruned via `ZREMRANGEBYSCORE('-inf', now)`. A plain set would grow unboundedly.
- **Double `EXPIRE` on tag keys.** `NX` sets a TTL on a key that has none; `GT` extends one that does (Redis 7+). Neither mode alone covers both cases.
- **`ttlSeconds <= 0` means "skip caching entirely"** — it is not a Redis error, it is a feature flag at the call site.
- **Refresh claims use a `refresh:` sub-prefix** so they never collide with, or get deleted alongside, the actual cache entry.
- **Stryker annotations** (`// Stryker disable all` / `// Stryker restore all`) wrap the `logger.warn` calls in catch blocks so mutation testing does not flag dead-code mutations in the intentionally-swallowing error paths.
- **One connection per process.** The file's header comment stresses that a client-per-request pattern would exhaust Redis connection limits; `manageConnection` enforces the single-client invariant.
