---
source: src/infrastructure/adapters/redis.ts
sha256: 2892cb65d4aa239e88e876de12853c7cbcdd8e15ded750a7c07f4e33c61e3a52
generated_at: 2026-09-27T14:08:10.818724+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/redis.ts

## Purpose

Shared plumbing for every Redis-backed adapter in this codebase. It centralises URL assembly from environment variables, the node-redis client options, client construction, graceful shutdown, and connection-error detection. Adapter-specific concerns (error-listener policy, `connect()` retry strategy) are deliberately left out so each adapter can differ.

## Key elements

- **`redisUrlFromHostPort(hostVariable, portVariable)`** – Builds a `redis://host:port` URL from two separate env-var names. Returns `undefined` when the port variable is unset, signalling "Redis not configured" to the caller. Host defaults to `127.0.0.1`.
- **`COMMAND_TIMEOUT_MS`** (private) – `1000`; the budget for a command still queued to be sent.
- **`redisClientOptions(url)`** – Returns the full node-redis options object: RESP2, `maintNotifications: 'disabled'`, `connectTimeout: 1000`, `reconnectStrategy: false`, `commandOptions.timeout: 1000`.
- **`createRedisClient(url)`** – Thin wrapper over `createClient(redisClientOptions(url))`; the single factory every adapter uses.
- **`RedisClient`** (type) – `ReturnType<typeof createRedisClient>`; the RESP2-variant client type (node-redis's own `RedisClientType` defaults to RESP3, so this is derived, not re-stated).
- **`closeRedisClient(client?)`** – Attempts `client.close()` (graceful, waits for queued replies); on failure falls back to `client.destroy()`. Accepts `undefined` (resolves immediately).
- **`REDIS_CONNECTION_ERRORS`** (private) – Array of the five node-redis error classes that mean "no server reachable."
- **`isRedisConnectionError(error)`** – `instanceof` check against the array above; exported for adapters and error-translation layers.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** – Consumes `createRedisClient`, `closeRedisClient`, and `isRedisConnectionError` for its cache-adapter lifecycle.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – Consumes the same exports; keeps a single client across `connect()` retries (the file's docstring calls out this contrast with the cache adapter).
- **`src/infrastructure/http/errors.ts`** – `isRedisConnectionError` is designed to feed the same status-code path as that file's `databaseErrorInterpreter` (a Redis outage maps to the same HTTP status as a Mongo outage).
- **`tests/unit/infrastructure/adapters/redis.test.ts`** – Unit-tests the exports in this file.

## Notes

- **RESP2 is pinned, not inherited.** node-redis 6 defaults to RESP3 + Enterprise maintenance notifications; both are overridden here because the callers (and `rate-limit-redis`'s raw commands) were written against RESP2.
- **`reconnectStrategy: false` is a literal**, not a boolean — node-redis' types require `false as const` to disable the background reconnect loop. Each adapter drives its own recovery.
- **`commandOptions.timeout` only covers the send window.** Once the command is on the wire the timer is dropped; a half-open connection still waits on the kernel for a reply.
- **Error matching uses `instanceof`, not `.name`.** The node-redis error classes never set `.name` (they all report as plain `Error`), so string matching would fail.
- **`redisUrlFromHostPort` returning `undefined` is intentional.** It is a "not configured" signal for the caller, not a bug or a fallback.
