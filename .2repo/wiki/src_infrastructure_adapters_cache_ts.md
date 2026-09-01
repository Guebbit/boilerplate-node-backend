# src/infrastructure/adapters/cache.ts

## Purpose

Redis cache adapter that exposes an opaque byte store with tag-based invalidation. It deliberately keeps zero knowledge of *what* is cached—serialisation, HTTP framing, and business semantics all belong to the caller (the HTTP middleware). Every public function fails open: if Redis is unreachable the app continues serving without a cache instead of erroring.

## Key elements

- **`CACHE_PREFIX`** – Constant read from `NODE_REDIS_CACHE_PREFIX` (default `boilerplate-node-backend`). Namespaces every key so staging and prod don't collide in the same Redis instance.
- **`getRedisUrl()`** – Builds a Redis URI from `NODE_REDIS_URL` or `NODE_REDIS_HOST`/`NODE_REDIS_PORT`. Returns `undefined` when unset (caching off, not an error).
- **`isCacheEnabled()`** – True only when a URL is configured **and** `NODE_REDIS_CACHE_ENABLED` is not `0`. Two independent switches; the flag is a debugging kill-switch.
- **`cacheConnection`** – The single `manageConnection<RedisClientType>` instance for this process. Configures a 1 s connect timeout, `reconnectStrategy: false` (no background retry loop), and a mandatory `error` listener. Recovery is driven by traffic.
- **`cacheState()`** – Exported. Returns a `DependencyStatus` snapshot for the health endpoint without issuing a Redis round-trip.
- **`startCache()`** / **`stopCache()`** – Exported. Warm up the connection at boot; gracefully quit (falling back to `destroy()`) and forget the client at shutdown.
- **`getCacheValue(key)`** – Exported. `GET` on `<prefix>:key:<key>`. Resolves `undefined` on miss, failure, or disabled—callers cannot distinguish which.
- **`setCacheValue(key, value, ttlSeconds, tags?)`** – Exported. `SET` with `EX` TTL, then `SADD` the key into each tag's set. `ttlSeconds <= 0` is a no-op. Tags are de-duplicated and empty strings filtered.
- **`invalidateCacheTags(tags)`** – Exported. For each tag: `SMEMBERS` → variadic `DEL` on members → `DEL` the tag set. Returns `{ deleted, reachable }`. Never rejects.

## Relationships

- **`src/infrastructure/adapters/managed-connection.ts`** – Supplies the `manageConnection` lifecycle wrapper (memoise, in-flight dedup, warn-once) that `cacheConnection` builds on.
- **`src/infrastructure/adapters/logger.ts`** – All warn-level diagnostics (read/write/invalidate failures) are routed through the shared `logger`.
- **`src/infrastructure/runtime/environment.ts`** – `environmentFlag` reads `NODE_REDIS_CACHE_ENABLED` for the kill-switch check.
- **`src/infrastructure/observability/dependency-health.ts`** – Consumes `cacheState()` to report Redis status on `GET /observability/health`; this module only reads memoised state, never pings.
- **`src/infrastructure/http/middlewares/cache.ts`** – The primary caller of `getCacheValue`, `setCacheValue`, and `invalidateCacheTags`; owns the HTTP-response framing and tag naming.
- **`src/infrastructure/runtime/server-lifecycle.ts`** / **`src/app.ts`** – Orchestrate `startCache()` at boot and `stopCache()` at shutdown.
- **`db/cache-clear.ts`** – Provides the `ClearCacheResult` type that `invalidateCacheTags` returns.
- **`tests/unit/infrastructure/adapters/cache.test.ts`** – Unit tests for every exported function and the fail-open contract.
- **`tests/unit/infrastructure/http/middlewares/cache.test.ts`** – Integration-level tests exercising the middleware's use of this adapter.
- **`tests/unit/infrastructure/observability/dependency-health.test.ts`** – Verifies `cacheState()` integration into the health payload.

## Notes

- **Fails open, always.** Every public function resolves to a "no cache" answer (`undefined`, `{ deleted: 0 }`, etc.) rather than rejecting. Callers must treat the result as best-effort.
- **No auto-reconnect.** `reconnectStrategy: false` is deliberate—the node-redis retry loop would log on every attempt and hold background sockets. A new client is built per *attempt* via `manageConnection`; recovery is purely traffic-driven.
- **`isReady` vs `isOpen`.** The readiness check uses `client.isReady` (socket up **and** handshake done), not `client.isOpen`, so a dropped connection is detected and the stale client is replaced.
- **`client.on('error', …)` is mandatory**, not just for logging. node-redis is an EventEmitter; an unhandled `'error'` event crashes the process.
- **Tags enable group invalidation** because Redis cannot efficiently `KEYS`/scan-delete by pattern. The tag set (`<prefix>:tag:<name>`) is the index; the entry key is the payload.
- **Staging and production must set different `NODE_REDIS_CACHE_PREFIX` values** if they share a Redis instance, or they will read each other's cached responses.
- **TTL is the only expiry mechanism.** `EX` on `SET` means Redis self-trims; there is no background cleanup job.
- **Invalidate-then-serve, not invalidate-then-refetch.** `invalidateCacheTags` resolves `{ reachable: false }` when Redis is down; the pre-write response remains cached until its TTL expires. The caller decides whether that stale window is acceptable.
