# src/infrastructure/adapters/cache.ts

## Purpose

A Redis byte-store adapter that provides four low-level operations (read, write, tag-invalidate, lifecycle) over an opaque `string` payload. It exists so that the HTTP caching middleware, tag-based invalidation, and any future caller can share one connection and one key-namespace scheme without re-implementing Redis plumbing. Every function **fails open**: a Redis outage or disabled flag resolves to `undefined` / a no-op rather than throwing, because the cache is an optimisation, never a hard dependency.

## Key elements

- **`CACHE_PREFIX`** – env-derived key prefix (`NODE_REDIS_CACHE_PREFIX`, default `boilerplate-node-backend`) that isolates this app's keys in a shared Redis instance.
- **`getRedisUrl()`** – resolves a connection URL from `NODE_REDIS_URL` or `NODE_REDIS_HOST`+`NODE_REDIS_PORT`; returns `undefined` when neither is set (caching off).
- **`isCacheEnabled()`** – ANDs "a URL exists" with the `NODE_REDIS_CACHE_ENABLED` environment flag (default `true`). The flag acts as an explicit production kill-switch.
- **`cacheConnection`** – a `manageConnection<RedisClientType>` instance holding the single shared Redis client. Notable socket settings: 1 s `connectTimeout`, `reconnectStrategy: false` (one clean attempt per call; recovery is traffic-driven). `close` uses `quit()` with a `destroy()` fallback.
- **`cacheState()`** *(exported)* – returns a `DependencyStatus` by reading the memoised connection state (no I/O), used by the health endpoint.
- **`startCache()`** *(exported)* – warms up the connection during boot so the first request doesn't pay the connect cost. Intentionally non-blocking for the listener.
- **`stopCache()`** *(exported)* – gracefully closes the client (`quit` → `destroy` fallback) and discards the memoised handle.
- **`getCacheValue(key)`** *(exported)* – `GET <prefix>:key:<key>`; resolves `undefined` on miss, failure, or disabled caching (caller cannot and need not distinguish).
- **`setCacheValue(key, value, ttlSeconds, tags?)`** *(exported)* – `SET` with `EX` TTL, then `SADD` the key into each tag's Redis set. `ttlSeconds <= 0` is a no-op. Tags are de-duplicated and empty strings filtered.
- **`invalidateCacheTags(tags)`** *(exported)* – reads each tag's set, deletes all referenced keys, then deletes the tag set. Returns a `ClearCacheResult` (`{ deleted, reachable }`); never rejects.

## Relationships

- **`src/infrastructure/runtime/managed-connection.ts`** – provides the `manageConnection` lifecycle wrapper (memoise, shared in-flight connect, single warning, `undefined`-on-failure semantics) around the Redis client.
- **`src/infrastructure/adapters/logger.ts`** – `logger.warn` is called on every failed read or write so operators see cache degradation without the request failing.
- **`src/infrastructure/runtime/environment.ts`** – `environmentFlag('NODE_REDIS_CACHE_ENABLED', true)` supplies the kill-switch check.
- **`src/infrastructure/observability/dependency-health.ts`** – the `DependencyStatus` type is imported here; `cacheState()` feeds the `/observability/health` endpoint.
- **`src/infrastructure/http/middlewares/cache.ts`** – the primary consumer; wraps responses in a replayable envelope and delegates to `getCacheValue` / `setCacheValue` / `invalidateCacheTags`.
- **`src/infrastructure/runtime/server-lifecycle.ts`** – calls `startCache()` on boot and `stopCache()` on shutdown.
- **`db/cache-clear.ts`** – exposes the operator-facing `clearCache` function that shares the `ClearCacheResult` shape and the same split-logic for "caching off" vs. "client unavailable."
- **`tests/unit/infrastructure/adapters/cache.test.ts`** – unit tests for the adapter's read/write/invalidate/lifecycle paths.
- **`docs/tools/redis-cache.md`** – operational documentation referenced throughout the file's docblocks (key scheme, tag invalidation, why no cross-instance broadcast).

## Notes

- **Tag sets carry no TTL.** They accumulate references to already-expired keys until `invalidateCacheTags` clears them. Deleting a non-existent key is a no-op in Redis, so this is harmless but means the sets grow monotonically until an invalidation pass.
- **`reconnectStrategy: false` is deliberate.** node-redis' default loop would retry forever in the background and log on every attempt. Here each `getCacheValue` / `setCacheValue` call is one clean attempt; the next request drives the next retry.
- **The stored value is an opaque `string`.** The HTTP-response envelope (status, body, size cap, TTL) is owned by the middleware, not this adapter. Other callers should serialize their own bytes and use the same four functions.
- **`NODE_REDIS_CACHE_ENABLED=0`** disables caching without touching the Redis service — useful for debugging suspected stale-cache issues in production.
- **Key scheme:** `<prefix>:key:<hash>` (string) and `<prefix>:tag:<name>` (set). Staging and production must use different `NODE_REDIS_CACHE_PREFIX` values if they share a Redis server.
