---
source: src/infrastructure/adapters/cache.ts
source_sha256: be2abb89cb5bc499c73f1609ff99cbad0e87400dda623b1c6d4d26378d54e5b4
context_sha256: f3b5f9844b191977b82e7e43f053e7de621464990a8be28a6f97a3a754f83f04
generated_at: 2026-11-22T02:35:17.445007+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/cache.ts

## Purpose
Redis cache adapter that acts as an opaque byte store with tag-based invalidation. Every function fails open: if Redis is unreachable or caching is disabled, the app keeps serving without a cache instead of erroring. What is cached (currently HTTP responses) and how it is serialized is left to callers.

## Key elements
- `cacheState()` returns the connection's `DependencyStatus` for `GET /observability/health`. It reads memoised state and does no I/O.
- `startCache()` warms up the Redis connection at boot so the first request doesn't pay the connect cost. A missing Redis must not block the server from listening.
- `stopCache()` closes Redis gracefully and forgets the client so a later restart starts clean.
- `getCacheValue(key)` reads one value. It resolves `undefined` on a miss, a failure, or when caching is disabled.
- `getCacheValues(keys)` reads many values via `MGET` in one round trip. It returns one slot per key, in order, and an empty input returns `[]`.
- `deleteCacheValues(keys)` deletes by key with a variadic `DEL`. It never rejects, and an empty input is a no-op.
- `setCacheValue(key, value, ttlSeconds, tags = [])` stores a value with `EX` TTL and indexes it under its tags. It never rejects. A TTL `<= 0` means "don't cache". Tags are de-duplicated and empty strings are dropped.
- `indexUnderTag(...)` (internal) adds a key to a tag's sorted-set index. It first prunes expired members with `zRemRangeByScore`, then calls `zAdd` scored by the entry's expiry in epoch ms, then `expire(..., 'NX')`. The rest of the function is cut off in the provided content.
- Internal helpers:
  - `isCacheEnabled()` is true only when a Redis URL is configured and `NODE_REDIS_CACHE_ENABLED` is truthy.
  - `prefix()` namespaces keys with `NODE_REDIS_CACHE_PREFIX`.
  - `cacheConnection` is the single shared client, built with `manageConnection`.

## Relationships
- `src/infrastructure/adapters/managed-connection.ts`: supplies `manageConnection` and the `DependencyStatus` type. It handles memoising, sharing the in-flight connect, and warning once. This file only supplies the Redis-specific `isEnabled`, `isReady`, `connect` and `close` callbacks.
- `src/infrastructure/adapters/redis.ts`: supplies `createRedisClient`, `closeRedisClient`, `configuredRedisUrl` and the `RedisClient` type.
- `src/infrastructure/adapters/config.ts`: `redisConfig()` provides `NODE_REDIS_CACHE_ENABLED` and `NODE_REDIS_CACHE_PREFIX`.
- `src/infrastructure/adapters/logger.ts`: used to log warnings when reads, writes and deletes fail.
- `src/infrastructure/observability/metrics-cache.ts`: `cacheInvalidationFailuresTotal` is imported here. Its usage is not visible in the provided portion.

Other listed neighbors (such as `src/infrastructure/http/middlewares/cache.ts`, `src/app/process-boot.ts`, `src/infrastructure/runtime/server-lifecycle.ts` and the scripts) are not shown interacting with this file in the visible content.

## Notes
- Keys are stored as `<prefix>:key:<key>` (string). Tag indexes are stored as `<prefix>:tag:<name>` (sorted set scored by expiry).
- Use different `NODE_REDIS_CACHE_PREFIX` values for staging and production, since Redis has no namespaces beyond numbered databases and they would otherwise read each other's responses.
- A failed delete or write only logs a warning. A stale entry is bounded by its own TTL.
- The `client.on('error', ...)` listener is mandatory, because an unhandled node-redis `'error'` event would crash the process.
- A new client is built on each connect attempt. A dropped client (`isReady` false) is replaced rather than reused.
- Tag index TTL uses `EXPIRE ... NX`. The comments say a second `GT` call extends shorter TTLs (Redis 7+), but that part is not visible here.
- Setting `NODE_REDIS_CACHE_ENABLED=0` disables caching without tearing down Redis.
