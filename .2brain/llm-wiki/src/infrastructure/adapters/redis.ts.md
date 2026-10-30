---
source: src/infrastructure/adapters/redis.ts
sha256: d37a2edea5168877df212a530487721a6fb8795062e2398f55301600b916580d
generated_at: 2026-10-29T01:56:56.295479+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/redis.ts

## Purpose

Shared Redis plumbing for every Redis-backed adapter in this codebase: URL assembly from environment variables, the node-redis client options (timeouts, keepalive, RESP2), a single client factory, a graceful close helper, and a predicate that classifies "server unreachable" errors. Adapters that *differ* in recovery strategy (cache vs. rate-limit) keep that logic in their own files rather than here.

## Key elements

- **`configuredRedisUrl()`** – Returns the Redis URL as a string, or `undefined` if Redis was not supplied. Prefers `NODE_REDIS_URL`; otherwise assembles from `NODE_REDIS_HOST` / `NODE_REDIS_PORT` / `NODE_REDIS_PASSWORD` (password is `encodeURIComponent`-encoded to survive `@`, `/`, `#`).
- **`redisClientOptions(url)`** *(private)* – Builds the node-redis options object: `connectTimeout` 1 s, `reconnectStrategy: false`, `socketTimeout` 1 s (half-open guard), `pingInterval` 500 ms, `commandOptions.timeout` 1 s, `RESP: 2`, `maintNotifications: 'disabled'`.
- **`createRedisClient(url)`** – Wraps `createClient(redisClientOptions(url))`; the single entry point every adapter uses to obtain a client.
- **`RedisClient`** – Type alias (`ReturnType<typeof createRedisClient>`), reflecting the RESP2 protocol parameter.
- **`closeRedisClient(client | undefined)`** – Graceful shutdown: `close()` → fallback `destroy()`; resolves immediately if the client is `undefined`.
- **`isRedisConnectionError(error)`** – Returns `true` when the error is an `instanceof` one of node-redis's five connection-error classes (`ClientClosedError`, `ClientOfflineError`, `ConnectionTimeoutError`, `SocketClosedUnexpectedlyError`, `SocketTimeoutError`). Used to distinguish "no server" from "command refused."
- **`COMMAND_TIMEOUT_MS` / `KEEPALIVE_PING_MS`** *(private constants)* – 1000 ms and 500 ms respectively.

## Relationships

- **`src/infrastructure/adapters/config.ts`** – Imports `redisConfig()` to read the `NODE_REDIS_*` environment variables used by `configuredRedisUrl()`.
- **`src/infrastructure/adapters/cache.ts`** – Consumes `createRedisClient`, `closeRedisClient`, and `isRedisConnectionError`; drives its own retry loop (fresh client per attempt) and degrades quietly on connection errors.
- **`src/infrastructure/adapters/limits-redis.ts`** – Consumes the same shared exports; keeps a single client across retry attempts and logs at `error` level on failures.
- **`src/infrastructure/http/errors.ts`** – `isRedisConnectionError` is the Redis counterpart to the Mongo check inside `databaseErrorInterpreter`, so HTTP responses map Redis outages to the same 503 / "database unavailable" status.
- **`tests/unit/infrastructure/adapters/redis.test.ts`** – Unit-tests `configuredRedisUrl` assembly logic, `isRedisConnectionError` classification, and `closeRedisClient` behavior.
- **`tests/cluster/redis-idle.test.ts`** – Integration test that exercises the keepalive / idle-socket path against a real Redis instance.

## Notes

- **Two independent 1-second timers serve different failure modes.** `commandOptions.timeout` covers a command still *queued* (socket connecting); `socket.timeout` covers a socket that is open but silent (half-open TCP). Neither covers a command that is on the wire and a reply that never arrives—`pingInterval` is what detects that case.
- **`reconnectStrategy: false` is deliberate.** Each adapter owns its own recovery loop; letting node-redis reconnect in the background would retry forever and spam logs.
- **`RESP: 2` is pinned explicitly** so the wire format matches what `rate-limit-redis` raw commands expect, rather than inheriting node-redis 6's RESP3 default.
- **`isRedisConnectionError` uses `instanceof`, not `.name`.** Node-redis error classes do not set `.name`, so name-based matching (as done for Mongo in `mongo-errors.ts`) would not work here.
