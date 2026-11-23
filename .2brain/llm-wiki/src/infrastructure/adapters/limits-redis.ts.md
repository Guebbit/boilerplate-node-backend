---
source: src/infrastructure/adapters/limits-redis.ts
generated_at: 2026-11-22T02:38:48.752801+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/adapters/limits-redis.ts

## Purpose
Manages the connection to the dedicated `limits` Redis instance, which holds data that must not be evicted: rate-limit counters and single-use claims (e.g. spent ALTCHA solutions). The cache Redis runs `allkeys-lru` and could drop these keys under pressure, resetting budgets or making solutions replayable. So these live on a separate `noeviction` instance.

## Key elements
- `limitsKeyPrefix()` — key namespace from `rateLimitConfig().NODE_RATE_LIMIT_REDIS_PREFIX`, separate from the cache prefix.
- `limitsRedisUrl()` — `NODE_RATE_LIMIT_REDIS_URL` or `undefined`. It never falls back to the cache's URL.
- `buildLimitsClient(url)` — creates, but doesn't connect, a client via `createRedisClient`. It attaches a no-op `'error'` listener, because an unhandled error event would crash the process.
- `connectionFor(url)` (private) — lazily builds and memoises a `ManagedConnection<RedisClient>` through `manageConnection`. It logs an `error`-level "unreachable" message and an `info` message on recovery. It keeps its own `redisClient` handle so a half-handshaken client is reused rather than reconnected. On connect failure the client is destroyed and cleared. `forget` is wrapped to clear that handle too.
- `sendToLimits(url, command)` — sends a raw command via `sendCommand<RedisReply>`. It rejects if Redis is unreachable. On a command failure it destroys the client, forgets the connection and reports it unavailable, then rethrows.
- `stopLimitsRedis()` — closes the connection on shutdown; it does nothing if no connection was made.
- `claimLimitsKey(key, seconds)` — atomic `SET NX EX` under `<prefix>:claim:<key>`. Returns `'claimed'`, `'taken'` or `'unavailable'`.
- `isLimitsKeyClaimed(key)` — read-only `EXISTS`. Returns `true` only if Redis says the claim exists, and `false` on a miss, with no URL, or on error.

## Relationships
- Uses `redis.ts` (`createRedisClient`, `closeRedisClient`, `RedisClient`) for the client.
- Uses `managed-connection.ts` (`manageConnection`) for memoised handle, deduped connect and warn-once behaviour.
- Reads `rateLimitConfig` from `src/infrastructure/http/config.ts` for the URL and prefix.
- Logs through `logger.ts`.
- The `rate-limit-store.ts` middleware and `altcha-store.ts` are the consumers named by the file's purpose (rate-limit counters, spent ALTCHA solutions). The file does not show how they call it.
- `server-lifecycle.ts` is the likely shutdown caller of `stopLimitsRedis`.
- Covered by `tests/unit/infrastructure/adapters/limits-redis.test.ts`. The `rate-limit-store*.test.ts` files and `scripted-environment.ts` are also related through the graph.

## Notes
- With no URL configured, the claim helpers return `unavailable`/`false` and callers use their in-process stores. This is deliberate and must not be swapped for the cache Redis.
- Unlike the cache adapter, `getOrThrow` rejects instead of resolving `undefined`, so each caller picks its own fallback. The claim helpers swallow errors, log a warning and return the "unavailable" value.
- A single client is shared per process and is not recreated per attempt. node-redis rejects a second `connect()` that races the first with `Socket already opened`.
- `isEnabled` is always `true`, because a connection is only created when a URL exists.
- The `limitsConnection` module singleton is built with the first `url` passed in. Later URLs are ignored.
