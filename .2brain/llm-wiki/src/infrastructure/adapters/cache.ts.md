---
source: src/infrastructure/adapters/cache.ts
sha256: 08bee422b3ed16d23442d147057504b8b7b22113d68ad7cbfa96f6708ec4f86d
generated_at: 2026-09-23T17:38:22.527437+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/cache.ts

## Purpose

Redis cache adapter that exposes an opaque byte store with tag-based invalidation. Every operation fails open: if Redis is unreachable the app continues serving without a cache rather than erroring. It owns no policy about *what* is cached or how values are serialized — that is the caller's responsibility.

## Key elements

- **`startCache()` / `stopCache()`** — Warm up the Redis connection at boot (non-blocking) and close it on shutdown, respectively. Both delegate to `cacheConnection`.
- **`cacheState()`** — Returns a `DependencyStatus` (memoised, no I/O) for the health/observability endpoint.
- **`getCacheValue(key)`** — Reads one namespaced string from Redis. Resolves `undefined` on miss, failure, or when caching is disabled; callers cannot distinguish the cases.
- **`setCacheValue(key, value, ttlSeconds, tags)`** — Writes a value with a Redis `EX` TTL and indexes it under one or more tag sets (SADD). A `ttlSeconds <= 0` short-circuits as a no-op.
- **`claimCacheRefresh(key, seconds)`** — Distributed single-writer lock via `SET NX EX`; exactly one worker/replica wins. Returns `false` on any failure so a flaky claim never looks like an in-flight rebuild.
- **`invalidateCacheTags(tags)`** — For each tag: SMEMBERS → variadic DEL of members → DEL of the tag set. Returns a `ClearCacheResult` (`{ deleted, reachable }`); never rejects.
- **`cacheConnection`** (internal) — A `manageConnection<RedisClientType>` instance that memoises a single client, shares in-flight connects, and reports unavailability once.
- **`CACHE_PREFIX`**, **`getRedisUrl()`**, **`isCacheEnabled()`** — Configuration helpers; `isCacheEnabled` requires both a resolvable URL *and* the `NODE_REDIS_CACHE_ENABLED` flag (default `true`).

## Relationships

- **`@infrastructure/adapters/managed-connection`** — Supplies `manageConnection` and `DependencyStatus`; all connection lifecycle (memoise, shared connect, warn-once) is delegated here.
- **`@infrastructure/adapters/redis`** — Provides `createClient`-adjacent helpers: `redisClientOptions`, `redisUrlFromHostPort`, `closeRedisClient`.
- **`@infrastructure/adapters/logger`** — All failure paths log via `logger.warn`.
- **`@infrastructure/runtime/environment`** — `environmentFlag('NODE_REDIS_CACHE_ENABLED', …)` acts as the kill switch.
- **`@infrastructure/observability/metrics-cache`** — Imports `cacheInvalidationFailuresTotal` for counting failed invalidation calls.
- **`src/infrastructure/http/middlewares/cache.ts`** — The HTTP-layer caller that reads/writes cached responses and triggers tag invalidation.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Orchestrates `startCache` / `stopCache` during the server lifecycle.
- **`scripts/db/cache-clear.ts`** — Operational script that exercises `invalidateCacheTags` (or a similar clear path).

## Notes

- The module is intentionally **policy-free**: it stores bytes and manages tags; HTTP framing, serialization, and cache-aside logic live in the middleware.
- A single client per process is enforced by `manageConnection`; creating a client per request would exhaust Redis' connection limit.
- The `client.on('error', …)` listener is **mandatory** (node-redis is an EventEmitter; an unhandled `'error'` crashes the process), not merely for logging.
- `invalidateCacheTags` needs no cross-instance broadcast — all workers share the same Redis, so one SMEMBERS+DEL invalidates globally. The `reachable: false` field signals a stale-read window, not an error.
- Stryker mutation-testing annotations (`Stryker disable all` / `restore all`) wrap the `catch` blocks; the `return undefined` / `return false` in those blocks is the intentional fail-open contract and should not be "fixed" by mutation testing.
