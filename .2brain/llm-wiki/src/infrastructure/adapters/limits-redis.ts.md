---
source: src/infrastructure/adapters/limits-redis.ts
sha256: 5411b998004152b9b3a61b69970f748fb375d70e304e1bad7b323d58aa4d4067
generated_at: 2026-10-14T07:45:22.519971+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/limits-redis.ts

## Purpose

Manages the dedicated `limits` Redis instance that stores rate-limit counters and single-use claims (e.g. spent ALTCHA solutions) under a `noeviction` policy. It exists separately from the response-cache instance so that an `allkeys-lru` flush or pressure-driven eviction on the cache can never silently reset a budget or reopen a replayable solution.

## Key elements

- **`limitsKeyPrefix()`** — returns the key namespace for all limits data, sourced from `NODE_RATE_LIMIT_REDIS_PREFIX`. Deliberately separate from the cache prefix so rotating or flushing the cache never touches limits.
- **`limitsRedisUrl()`** — returns `NODE_RATE_LIMIT_REDIS_URL` or `undefined`. No fallback to the cache URL; the two instances must stay distinct.
- **`buildLimitsClient(url)`** — constructs (does not connect) a `RedisClient` via `createRedisClient` and attaches a mandatory no-op `'error'` listener to prevent unhandled EventEmitter crashes.
- **`connectionFor(url)`** — memoised internal that wraps the client in a `ManagedConnection`. Keeps the same socket across reconnect attempts (avoids node-redis's "Socket already opened" race). Exposes a `forget()` that also discards the held client reference.
- **`sendToLimits(url, command)`** — sends a raw command array to the limits instance. On failure, destroys the client, forgets the connection, reports unavailability, and rethrows. Return type is `RedisReply` (from `rate-limit-redis`).
- **`stopLimitsRedis()`** — shuts down the memoised connection; called on server shutdown for a clean socket on next start.
- **`claimLimitsKey(key, seconds)`** — atomic one-shot claim via `SET NX EX`. Returns `'claimed'` (winner), `'taken'` (loser), or `'unavailable'` (no Redis / failure). Namespaced under `claimKey`.
- **`isLimitsKeyClaimed(key)`** — read-only `EXISTS` check; returns `true` only on a confirmed hit, `false` on miss, no-Redis, or error.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — provides `createRedisClient` and `closeRedisClient` used to construct and tear down the client.
- **`src/infrastructure/adapters/managed-connection.ts`** — supplies the `manageConnection` helper for memoised connect, warn-once unavailability, and `getOrThrow` semantics.
- **`src/infrastructure/adapters/logger.ts`** — imported as `logger` for info/warn messages on recovery and claim failures.
- **`src/infrastructure/http/config.ts`** — source of `rateLimitConfig()` which provides both the URL and prefix.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — consumes `sendToLimits` (via `rate-limit-redis`) to read/write rate-limit counters on this instance.
- **`src/infrastructure/adapters/antibot-providers/altcha-store.ts`** — calls `claimLimitsKey` / `isLimitsKeyClaimed` to record and verify spent ALTCHA solutions.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — invokes `stopLimitsRedis()` during graceful shutdown.
- **`tests/unit/infrastructure/adapters/limits-redis.test.ts`** — unit tests for the exports in this file.

## Notes

- The connection is intentionally **not** replaced with a fresh client on each reconnect attempt (unlike the cache adapter). A half-handshaken socket is still the same logical socket; calling `connect()` again on it throws `Socket already opened`. The `redisClient` local is reused until it is explicitly destroyed.
- `buildLimitsClient` attaches `redisClient.on('error', () => undefined)`. This is load-bearing: node-redis is an EventEmitter and an unhandled `'error'` event crashes the process.
- `claimLimitsKey` and `isLimitsKeyClaimed` both degrade to a safe in-process fallback (`'unavailable'` / `false`) when no URL is configured or Redis is unreachable, so callers never need to check for `undefined` beforehand.
- The `unavailableMessage` in `manageConnection` is deliberately specific: it tells the operator that, while limits Redis is down, budgets are per-process and claims are per-process (the "browsing brake" passes without a shared budget).
