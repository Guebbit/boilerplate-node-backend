---
source: src/infrastructure/adapters/redis.ts
sha256: d37a2edea5168877df212a530487721a6fb8795062e2398f55301600b916580d
generated_at: 2026-11-08T03:23:12.597520+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/redis.ts

## Purpose

Shared Redis client infrastructure for all Redis-backed adapters (cache, rate limiter). Centralises URL assembly from environment variables, the node-redis client option set, a typed client factory, graceful shutdown, and connection-error classification—so each adapter only handles its own `error` listener and recovery strategy.

## Key elements

- **`configuredRedisUrl()`** — Returns the Redis URL (`NODE_REDIS_URL` verbatim, or assembled from `NODE_REDIS_HOST`/`PORT`/`PASSWORD`). Returns `undefined` when Redis is unconfigured.
- **`redisClientOptions(url)`** *(internal)* — Builds the node-redis options object: RESP2, 1 s connect/command/idle timeouts, 500 ms `pingInterval`, `reconnectStrategy: false`, `maintNotifications: 'disabled'`.
- **`createRedisClient(url)`** — Calls `createClient` with the shared options; the single client-construction path for all adapters.
- **`RedisClient`** — Type alias (`ReturnType<typeof createRedisClient>`), pinned to the RESP2 client rather than node-redis's RESP3 default.
- **`closeRedisClient(client)`** — Graceful `close()` with `destroy()` fallback; no-op when `client` is `undefined`.
- **`isRedisConnectionError(error)`** — `instanceof` check against the five node-redis connection-error classes; distinguishes "server unreachable" from "command refused."

## Relationships

- **`src/infrastructure/adapters/config.ts`** — Imports `redisConfig()` to read the `NODE_REDIS_*` environment variables.
- **`src/infrastructure/adapters/cache.ts`** — Consumer: uses `configuredRedisUrl`, `createRedisClient`, `closeRedisClient`, and `isRedisConnectionError`.
- **`src/infrastructure/adapters/limits-redis.ts`** — Same consumer pattern for the rate-limit store.
- **`src/infrastructure/http/errors.ts`** — `isRedisConnectionError` is intended to feed the same status-mapping path as `databaseErrorInterpreter` in that file.
- **`tests/unit/infrastructure/adapters/redis.test.ts`** — Unit tests for URL assembly, client options, and error classification.
- **`tests/cluster/redis-idle.test.ts`** — Integration tests exercising the keepalive/idle-timeout behaviour.

## Notes

- **Two distinct timeouts, easy to conflate.** `commandOptions.timeout` only covers the window *before* the command hits the wire. A half-open socket (open locally, no reply ever) is guarded solely by `socket.timeout` (the idle timer). `pingInterval` (500 ms) is what prevents that idle timer from killing a healthy, quiet connection.
- **`reconnectStrategy: false` is deliberate.** No background reconnect loop; each adapter drives recovery from incoming traffic. A second `connect()` racing an in-flight one is rejected by node-redis, which is why the cache builds a fresh client per attempt while the rate limiter reuses one.
- **RESP2 is pinned explicitly.** node-redis 6 defaults to RESP3 + Enterprise maintenance notifications. The wire format is stated so `rate-limit-redis`'s raw commands and other callers keep working against the protocol they were written for.
- **Error matching uses `instanceof`, not `.name`.** All five node-redis connection-error classes report `.name === "Error"`; string matching would fail.
- **Password is `encodeURIComponent`-ed** when building the URL, because generated passwords routinely contain `@`, `/`, or `#` which would terminate the userinfo segment early.
