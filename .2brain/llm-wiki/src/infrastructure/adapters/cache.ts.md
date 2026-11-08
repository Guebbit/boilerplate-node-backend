---
source: src/infrastructure/adapters/cache.ts
sha256: 1b8c6dd2938818d694bad33e56fea006fdaa6ce4f7c0c2d25e1bc4cda64e61dd
generated_at: 2026-11-08T03:17:51.857807+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/cache.ts

## Purpose

Redis cache adapter that exposes an opaque byte store with tag-based group invalidation. It owns the single Redis connection for the process, handles the fail-open policy (all operations resolve successfully even when Redis is down), and provides a small API—`getCacheValue`, `setCacheValue`, `claimCacheRefresh`, `invalidateCacheTags`—that callers use without needing to know anything about Redis commands or connection lifecycle.

## Key elements

- **`startCache()`** / **`stopCache()`** — Warm up or gracefully close the shared Redis connection. Called by the server-lifecycle boot/shutdown sequence; a failure to connect never blocks the server from listening.
- **`cacheState()`** — Returns a `DependencyStatus` string for the health endpoint. Reads memoised connection state; performs no I/O.
- **`getCacheValue(key)`** — Reads one value by key. Resolves `undefined` on miss, expiry, Redis failure, or cache disabled (callers cannot distinguish these).
- **`setCacheValue(key, value, ttlSeconds, tags?)`** — Writes a value with a Redis `EX` TTL and indexes it under each tag's sorted set. `ttlSeconds <= 0` is a no-op. Never rejects.
- **`claimCacheRefresh(key, seconds)`** — Distributed lock via `SET … NX EX` for refresh-ahead: exactly one caller wins across all workers; losers and failures get `false`.
- **`invalidateCacheTags(tags)`** — Deletes every entry indexed under the given tags. Resolves `{ deleted, reachable }`; never rejects. Shared Redis means no cross-instance broadcast is needed.
- **`cacheConnection`** (module-private) — The `manageConnection<RedisClient>` instance. Encapsulates connect/disconnect, readiness check (`client.isReady`), and the mandatory `error` event listener that prevents an unhandled-exception crash.
- **`indexUnderTag()`** (module-private) — Maintains a tag's sorted set: prunes expired members, `ZADD`s the new entry scored by epoch-ms expiry, and sets/extends the tag key's own TTL via `EXPIRE NX` + `EXPIRE GT`.

## Relationships

- **`@infrastructure/adapters/config.ts`** — Source of `redisConfig()` (prefix, enable flag) and `configuredRedisUrl()`.
- **`@infrastructure/adapters/redis.ts`** — Provides `createRedisClient`, `closeRedisClient`, `configuredRedisUrl`, and the `RedisClient` type.
- **`@infrastructure/adapters/managed-connection.ts`** — Supplies the `manageConnection` factory and `DependencyStatus` type that drive connection lifecycle and health reporting.
- **`@infrastructure/adapters/logger.ts`** — Structured logging for every warn-level failure path.
- **`@infrastructure/observability/metrics-cache.ts`** — Imports `cacheInvalidationFailuresTotal` for metrics on invalidation failures.
- **`src/infrastructure/http/middlewares/cache.ts`** — Primary consumer; calls `getCacheValue` / `setCacheValue` to frame and serve HTTP responses.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Calls `startCache` on boot and `stopCache` on shutdown.
- **`src/app.ts`** — Wires the adapter into the application composition.
- **`scripts/db/cache-clear.ts`** — Operational script that exercises `invalidateCacheTags` for manual cache clearing.

## Notes

- **Fail-open by design.** Every exported function resolves a benign value (`undefined`, `false`, `0`) on any Redis error rather than rejecting. Callers must treat a `null`/`undefined` result as "no cache hit" and fall back to the origin.
- **Key namespacing is mandatory.** `cachePrefix()` prepends `NODE_REDIS_CACHE_PREFIX` to every key. Staging and production *must* use different prefixes or they will read each other's data.
- **Tag indices use sorted sets, not plain sets.** Members are scored by absolute expiry (epoch ms). A plain set would accumulate zombie members after their entries expire. The two-step `EXPIRE NX` + `EXPIRE GT` pattern ensures the tag key's own TTL always covers its newest member.
- **`claimCacheRefresh` uses a `refresh:` sub-namespace** so the lock key is never deleted by a tag invalidation that targets the entry it protects.
- **The connection is intentionally singular per process.** The `connect` callback builds a *new* client on every attempt (not reused across failures) because a client that never completed its handshake has no useful state.
- **Stryker markers** (`Stryker disable/restore all`) surround the `catch` blocks—mutation-testing mutators are suppressed there because the "fail open" catch paths are the expected happy path when Redis is absent.
