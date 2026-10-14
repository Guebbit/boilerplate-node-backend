---
source: src/infrastructure/adapters/redis.ts
sha256: 5b46a1f0f7c68e0a9aa403e6a1175ad3f553d38d62b297320f7db86233024b51
generated_at: 2026-10-14T14:34:08.258332+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/redis.ts

## Purpose

Shared plumbing for every Redis-backed adapter in the codebase: URL assembly from environment variables, the node-redis client options (timeouts, protocol, reconnect policy), client creation, graceful shutdown, and connection-error detection. Deliberately excludes the per-adapter `error` listener and `connect()` retry strategy, because a cache and a rate limiter handle those differently.

## Key elements

- **`configuredRedisUrl()`** – Returns the Redis URL from `NODE_REDIS_URL`, or assembles one from `NODE_REDIS_HOST`/`PORT`/`PASSWORD` (password `encodeURIComponent`-d). Returns `undefined` when neither form is set, signalling "unconfigured" to the caller.
- **`redisClientOptions(url)`** – Returns the node-redis options object: RESP2, `maintNotifications` disabled, `connectTimeout` 1 s, `reconnectStrategy: false`, `socket.timeout` 1 s (idle-socket guard for half-open connections), `pingInterval` 500 ms, `commandOptions.timeout` 1 s.
- **`createRedisClient(url)`** – Thin wrapper around `createClient(redisClientOptions(url))`; the single entry point every adapter uses to get a client.
- **`RedisClient`** – Type alias for `ReturnType<typeof createRedisClient>`. Derived (not spelled out) because node-redis 6's own `RedisClientType` defaults to RESP3.
- **`closeRedisClient(client?)`** – Graceful shutdown: `close()` (waits for queued replies) with a fallback to `destroy()` (immediate socket drop) if `close()` rejects. No-op when the client is `undefined`.
- **`isRedisConnectionError(error)`** – `instanceof` check against the five node-redis "server unreachable" error classes. Returns `true` only for connection-level failures, not command-level rejections.

## Relationships

- **`src/infrastructure/adapters/config.ts`** – Provides `redisConfig()`, the env-var reader consumed by `configuredRedisUrl()`.
- **`src/infrastructure/adapters/cache.ts`** – A Redis-backed adapter that builds its client via `createRedisClient` and shuts down via `closeRedisClient`; supplies its own quiet error listener and per-attempt fresh-client retry.
- **`src/infrastructure/adapters/limits-redis.ts`** – The rate-limiter adapter; likewise uses the shared client factory/close, but keeps a single client across connect attempts (node-redis rejects a second racing `connect()`) and logs errors at `error` level.
- **`src/infrastructure/http/errors.ts`** – Referenced for parity: `isRedisConnectionError` is meant to feed the same status path as `databaseErrorInterpreter` for Mongo outages.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – Higher-level consumer that obtains a client through this module's factory for rate-limit reads/writes.
- **`tests/unit/infrastructure/adapters/redis.test.ts`** – Unit tests for the exports in this file.
- **`tests/cluster/redis-idle.test.ts`** – Integration test exercising the idle-socket / ping-keepalive behaviour.

## Notes

- **`instanceof`, not `.name`**: node-redis 6 error classes do not set `.name`, so every one of them reports as a plain `Error`. Matching by `.name` (as the Mongo adapter does) would miss all of them.
- **Two distinct 1 s timers**: `commandOptions.timeout` covers a command still queued before it hits the wire; `socket.timeout` covers a socket that goes silent *after* the command is sent (half-open connection). Neither alone is sufficient.
- **`pingInterval` is load-bearing**: without it, `socket.timeout` would close a healthy but idle connection every second, causing `unavailable` reads between requests.
- **`reconnectStrategy: false as const`** must be the literal `false`, not a plain `boolean`—node-redis' type signature requires it.
- **RESP2 is pinned explicitly** rather than relying on node-redis 6's RESP3 default, so that raw commands in `rate-limit-redis` and other callers continue to work against the protocol they were written for.
