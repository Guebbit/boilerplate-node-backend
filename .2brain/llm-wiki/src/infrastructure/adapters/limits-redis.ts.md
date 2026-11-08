---
source: src/infrastructure/adapters/limits-redis.ts
sha256: 5411b998004152b9b3a61b69970f748fb375d70e304e1bad7b323d58aa4d4067
generated_at: 2026-11-08T03:20:34.836051+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/adapters/limits-redis.ts

## Purpose

Manages a dedicated Redis instance for rate-limit counters and single-use claims (e.g. spent ALTCHA solutions). It is kept separate from the response-cache Redis instance because eviction is per-instance: the cache runs `allkeys-lru` and may drop keys under pressure, which would silently reset a budget or reopen a replayable solution. The limits instance uses `noeviction` so cache pressure can never reach it.

## Key elements

- **`limitsKeyPrefix()`** — Returns the key-namespace prefix for the limits instance, read from `rateLimitConfig().NODE_RATE_LIMIT_REDIS_PREFIX`. Separate from the cache prefix so a cache flush or prefix rotation never resets budgets or claims.
- **`limitsRedisUrl()`** — Returns `NODE_RATE_LIMIT_REDIS_URL` or `undefined`. Deliberately has no fallback to the cache URL.
- **`buildLimitsClient(url)`** — Constructs (does not connect) a `RedisClient` and attaches the mandatory `'error'` listener (node-redis is an EventEmitter; an unhandled error event would crash the process).
- **`sendToLimits(url, command)`** — Sends one raw command to the limits instance, opening the shared connection on first use. Rejects on failure; destroys the client and forgets the connection so the next call starts from a clean socket.
- **`claimLimitsKey(key, seconds)`** — Atomic single-use claim via `SET NX EX`. Returns `'claimed'` (one winner), `'taken'` (subsequent callers), or `'unavailable'` (no Redis / failure — caller falls back to in-process enforcement).
- **`isLimitsKeyClaimed(key)`** — Read-only `EXISTS` check without claiming. Returns `false` on miss, no Redis, or any failure.
- **`stopLimitsRedis()`** — Releases the managed connection on shutdown so a restart begins from a clean socket.
- **`claimKey(key)`** *(private)* — Namespaces a claim key under the limits prefix: `<prefix>:claim:<key>`.

## Relationships

- **`src/infrastructure/adapters/redis.ts`** — Imports `createRedisClient`, `closeRedisClient`, and the `RedisClient` type for client construction and teardown.
- **`src/infrastructure/adapters/managed-connection.ts`** — Imports `manageConnection` and `ManagedConnection` to delegate connect/dedup/recover/warn-once lifecycle.
- **`src/infrastructure/adapters/logger.ts`** — Imports `logger` for warn/error/info messages on claim failures and recovery.
- **`src/infrastructure/http/config.ts`** — Imports `rateLimitConfig` to read the limits URL and key prefix.
- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — Consumer: calls `sendToLimits` to execute rate-limit counter commands (INCR, EXPIRE, etc.) against this instance.
- **`src/infrastructure/adapters/antibot-providers/altcha-store.ts`** — Consumer: calls `claimLimitsKey` / `isLimitsKeyClaimed` to enforce single-use ALTCHA solutions across replicas.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Consumer: calls `stopLimitsRedis()` during graceful shutdown.
- **`tests/unit/infrastructure/adapters/limits-redis.test.ts`** — Unit tests for the module's exports.
- **`tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts`** / **`rate-limit-store-selection.test.ts`** — Verify how the rate-limit middleware selects and uses this store.

## Notes

- **Client reuse on reconnect (unlike cache):** `connectionFor` keeps a single `redisClient` across failed connect attempts. node-redis rejects a second `connect()` on the same socket with `Socket already opened`, so the cache adapter's "fresh client per attempt" pattern cannot be replicated here. On failure the client is destroyed and nulled; on success the *same* handle is returned.
- **`getOrThrow` rejects, not resolves-undefined:** Unlike the cache adapter, callers must handle the rejection themselves, allowing each to choose its own safe fallback (in-process counters, per-process claims, etc.).
- **No URL ⇒ in-process fallback:** When `NODE_RATE_LIMIT_REDIS_URL` is unset, `claimLimitsKey` short-circuits to `'unavailable'` and `isLimitsKeyClaimed` to `false`. Callers are responsible for their in-process floor; this module never silently falls back to the cache instance.
- **Mandatory `'error'` listener:** The empty `redisClient.on('error', () => undefined)` in `buildLimitsClient` is not defensive—it prevents a process-level crash from an unhandled EventEmitter error.
