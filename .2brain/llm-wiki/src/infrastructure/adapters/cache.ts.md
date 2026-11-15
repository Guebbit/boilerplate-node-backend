---
source: src/infrastructure/adapters/cache.ts
sha256: 787aefbae3ba0f7b900f354e82234fcb7a3ffa94d3f69bd2c9f89e24734ffa6e
generated_at: 2026-11-14T17:52:27.949782+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/cache.ts

## Purpose

Redis cache adapter that exposes a minimal, opaque byte store with tag-based group invalidation. It owns the single Redis connection for the process and guarantees fail-open semantics: every public function resolves (with `undefined`/`false`/`{deleted:0, reachable:false}`) rather than rejecting when Redis is missing or the cache is disabled. Callers (notably the HTTP cache middleware) decide what to cache and how to frame values; this module only stores, retrieves, and deletes bytes.

## Key elements

- **`cacheState()`** — Returns a `DependencyStatus` (memoised, no I/O) for the `/observability/health` endpoint.
- **`startCache()`** — Warm-up connect at boot; non-blocking by design so a missing Redis never prevents the server from listening.
- **`stopCache()`** — Graceful close + forget the client for a clean restart.
- **`getCacheValue(key)`** — Reads one namespaced string key; resolves `undefined` on miss, failure, or disabled cache.
- **`setCacheValue(key, value, ttlSeconds, tags?)`** — Writes a value with TTL and indexes it under each tag's sorted set. No-ops when `ttlSeconds <= 0`.
- **`claimCacheRefresh(key, seconds)`** — Atomic "one writer" lock via `SET NX EX` under a `refresh:` namespace; returns `true` only to the winner, `false` on any failure.
- **`invalidateCacheTags(tags)`** — Deletes all entries linked to the given tags across all replicas (shared Redis, no broadcast needed). Resolves `{ deleted, reachable }`; never rejects.
- **`indexUnderTag`** *(internal)* — Maintains each tag's sorted set: prunes expired members via `zRemRangeByScore`, adds the new key scored by its own expiry via `zAdd`, and extends the set's TTL with `expire NX` + `expire GT`.
- **`isCacheEnabled`** *(internal)* — Two independent gates: a Redis URL is configured **and** `NODE_REDIS_CACHE_ENABLED` is truthy.
- **`cacheConnection`** *(internal)* — The `manageConnection<RedisClient>` instance; single shared connection per process.

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Provides `redisConfig()` (prefix, enabled flag) consumed by `isCacheEnabled` and `prefix()`.
- **`src/infrastructure/adapters/redis.ts`** — Supplies `createRedisClient`, `closeRedisClient`, `configuredRedisUrl`, and the `RedisClient` type.
- **`src/infrastructure/adapters/managed-connection.ts`** — Provides `manageConnection` and `DependencyStatus`; this file delegates all memoise/share/warn-once lifecycle logic to it.
- **`src/infrastructure/observability/metrics-cache.ts`** — Imports `cacheInvalidationFailuresTotal` (incremented on invalidation failure; visible in the truncated `invalidateCacheTags` body).
- **`src/infrastructure/http/middlewares/cache.ts`** — Primary consumer of `getCacheValue` / `setCacheValue` / `claimCacheRefresh` for HTTP response caching.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Calls `startCache` / `stopCache` during boot and shutdown.
- **`src/app.ts`** — Top-level composition root; wires the cache adapter into the app graph.
- **`scenarios/apply.ts`** — Invokes `invalidateCacheTags` after a successful write to remove stale entries.
- **`scripts/db/cache-clear.ts`** — Operational script that clears cache entries (likely via `invalidateCacheTags` or direct Redis commands).
- **`src/infrastructure/adapters/image.worker.ts`** — Worker that may read/write cached image bytes through this adapter.

## Notes

- **Two independent enable switches.** `configuredRedisUrl()` being truthy and `NODE_REDIS_CACHE_ENABLED` being truthy are checked separately. Setting `NODE_REDIS_CACHE_ENABLED=0` is a debug kill-switch that leaves Redis running.
- **Namespace prefix is mandatory.** `NODE_REDIS_CACHE_PREFIX` prevents staging and production from reading each other's entries (Redis has no sub-namespaces beyond numbered DBs). All keys are `<prefix>:key:<hash>`, `<prefix>:tag:<name>`, or `<prefix>:refresh:<key>`.
- **Tag indexes are sorted sets, not plain sets.** Members are scored by their own expiry (epoch ms) and pruned on every write, so a tag's index shrinks as entries expire. A plain set would accumulate ghost members indefinitely.
- **`claimCacheRefresh` is a fire-and-forget lock.** There is no explicit release; the claim self-expires via `EX`. A Redis failure returns `false` (same as "lost the race"), so a flaky claim can never be mistaken for "a rebuild is in flight."
- **`client.on('error', …)` is mandatory, not cosmetic.** node-redis is an EventEmitter; an unhandled `'error'` event crashes the process.
- **Stryker mutation-testing guards** (`Stryker disable/restore all`) wrap every `logger.warn` in a catch block to keep mutation coverage honest without suppressing the log.
