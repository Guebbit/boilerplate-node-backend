---
source: src/infrastructure/http/middlewares/rate-limit-store.ts
sha256: 723798aca3a343277969f60f58026104d1bf3422d0081bbac0c35d3b22453e7e
generated_at: 2026-09-23T17:44:15.627501+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Provides the counter store that `express-rate-limit` uses to track per-key budgets. It backs every limiter with a shared Redis connection so the budget is global across cluster workers and instances, and falls back to an in-process `MemoryStore` when Redis is not configured. The design goal is fail-open: a Redis outage lets requests through unbudgeted rather than surfacing a 500.

## Key elements

- **`rateLimitStore(namespace)`** (exported) — Returns a `Store` for a given limiter namespace. If a Redis URL resolves, returns a lazy `RedisStore` wrapped by `lazyRedisStore`; otherwise returns a `MemoryStore` and logs an `error`-level warning when `NODE_CLUSTER_WORKERS > 1`.
- **`stopRateLimitStore()`** (exported) — Gracefully shuts down the limiter's Redis connection on process exit.
- **`redisUrl()`** (internal) — Resolves the limiter's Redis URL from `NODE_RATE_LIMIT_REDIS_URL` → `NODE_REDIS_URL` → host/port vars. Honours the `NODE_RATE_LIMIT_REDIS_ENABLED` kill-switch.
- **`build(url)`** (internal) — Creates a node-redis client with a mandatory `error` listener (unhandled `error` events would crash the process).
- **`connectionFor(url)`** (internal) — Memoises a single `ManagedConnection` for all limiters. Unlike the cache adapter, this one **fails closed** (`getOrThrow` rejects) and logs at `error`. Reuses the same socket across reconnect attempts (node-redis rejects a second concurrent `connect()`).
- **`send(url, command)`** (internal) — Sends one raw Redis command through the managed connection. On failure: destroys the client, forgets the connection, reports unavailability, and rethrows (caught upstream by `passOnStoreError`).
- **`lazyRedisStore(namespace, url)`** (internal) — Defers actual `RedisStore` construction (and its Lua-script `init`) to the first `increment` call, so importing this module never opens a connection.
- **`KEY_PREFIX`** — Constant (`NODE_RATE_LIMIT_REDIS_PREFIX` or `'rate-limit'`), intentionally separate from the cache's `NODE_REDIS_CACHE_PREFIX` so cache flushes don't reset budgets.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Consumer. Calls `rateLimitStore(namespace)` to obtain the store passed to `express-rate-limit`; its `passOnStoreError` flag is what converts a rejected `increment` into "let the request through."
- **`src/infrastructure/adapters/managed-connection.ts`** — Provides `manageConnection` which wraps connect / isReady / close / forget / reportUnavailable lifecycle. This file delegates all connection-state management to it.
- **`src/infrastructure/adapters/redis.ts`** — Supplies `redisClientOptions`, `redisUrlFromHostPort`, and `closeRedisClient` helpers.
- **`src/infrastructure/adapters/logger.ts`** — Used for `error`/`info` log output on outage, recovery, and misconfiguration.
- **`src/infrastructure/runtime/environment.ts`** — `environmentFlag('NODE_RATE_LIMIT_REDIS_ENABLED')` and `environmentNumber('NODE_CLUSTER_WORKERS')` gate behaviour.
- **`src/infrastructure/runtime/server-lifecycle.ts`** — Expected caller of `stopRateLimitStore()` during graceful shutdown (the file exposes it for exactly that purpose).
- **`tests/unit/.../rate-limit-store.test.ts`** / **`rate-limit-store-selection.test.ts`** — Unit tests for store construction, selection logic, and lazy-initialisation behaviour.

## Notes

- The Redis connection here is **separate** from the cache adapter's connection. Disabling the cache (`NODE_REDIS_CACHE_ENABLED=false`) does not affect rate limiting.
- Fail direction is asymmetric on purpose: the limiter's connection **fails closed** (`getOrThrow` rejects) so the store can report an error to `express-rate-limit`, which then fails **open** via `passOnStoreError`. The cache adapter fails open by resolving `undefined`.
- `lazyRedisStore` replays the `init` options that `express-rate-limit` passes at construction time; without the `.catch()` on that fire-and-forget `init()`, an uncaught rejection would kill the process (Node ≥ 15 default).
- The `redisClient` local inside `connectionFor` is kept **outside** `manageConnection`'s handle so that a half-handshaked client is reused on reconnect rather than discarded (node-redis throws `Socket already opened` on a second `connect()`).
- `KEY_PREFIX` is read from `process.env` at module load, not via `environmentFlag`—it is a constant string, not a toggle.
