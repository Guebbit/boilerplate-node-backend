---
source: src/infrastructure/http/middlewares/rate-limit-store.ts
sha256: abf1a9053735661381d6d5962f5f0e6e7574d2c104d73c0bd79cf72db78a99c5
generated_at: 2026-09-27T14:09:54.375354+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Provides the counter store that `express-rate-limit` uses to track per-client request budgets. Because the app runs one worker per CPU, the default in-process `Map` would multiply every budget by the worker count. This module swaps in a Redis-backed store (`rate-limit-redis`) so all workers and instances share a single budget, and falls back to an in-memory store (logging at `error` level) when Redis is unavailable. The Redis connection is deliberately separate from the cache connection so disabling the cache never disables rate limiting.

## Key elements

- **`rateLimitStore(namespace)`** *(exported)* — Returns a `Store` for one limiter. If a Redis URL resolves, returns a lazy `RedisStore`; otherwise returns a `MemoryStore` and logs an `error` when `NODE_CLUSTER_WORKERS ≠ 1`. The `namespace` argument isolates budgets between different limiters.
- **`stopRateLimitStore()`** *(exported)* — Gracefully closes the shared Redis connection on shutdown. Resolves immediately if no connection was ever created.
- **`redisUrl()`** *(internal)* — Resolves the limiter's Redis URL from `NODE_RATE_LIMIT_REDIS_URL`, `NODE_REDIS_URL`, or `NODE_REDIS_HOST`/`NODE_REDIS_PORT`. Honours the `NODE_RATE_LIMIT_REDIS_ENABLED` kill-switch. Uses `||` (not `??`) so empty-string env values are treated as unset.
- **`connectionFor(url)`** *(internal)* — Memoised `ManagedConnection<RedisClient>` shared by all limiters. Fails **closed** (`getOrThrow` rejects) and logs at `error` on unavailability. Reuses the same client across reconnect attempts to avoid node-redis's "Socket already opened" race.
- **`send(url, command)`** *(internal)* — Issues one Redis command, opening the connection on demand. On failure: destroys the client, forgets the connection, reports unavailability, and rethrows (letting `passOnStoreError` turn it into a pass-through).
- **`lazyRedisStore(namespace, url)`** *(internal)* — Wraps `RedisStore` so construction (and its `init` → Lua script load) is deferred to the first `increment` call, keeping module import side-effect-free. On `init` failure, discards the broken store and logs `error` so subsequent requests rebuild a fresh one.
- **`KEY_PREFIX`** *(internal)* — `NODE_RATE_LIMIT_REDIS_PREFIX` or `'rate-limit'`. Keeps limiter keys namespaced away from the cache prefix so a cache flush never resets budgets.

## Relationships

- **`rate-limit.ts`** — The consumer. Calls `rateLimitStore(namespace)` to obtain a store and sets `passOnStoreError: true` so a rejected `send` becomes a pass-through rather than a 500.
- **`managed-connection.ts`** — Supplies the `manageConnection` helper that wraps connect / isReady / close / reportUnavailable / forget lifecycle. This file configures it with `unavailableLevel: 'error'` and a custom `connect` that reuses one client instance.
- **`redis.ts`** — Provides `createRedisClient`, `closeRedisClient`, `redisUrlFromHostPort`, and the `RedisClient` type used here.
- **`logger.ts`** — Logs `error` (Redis unconfigured under cluster, init failure, unavailability) and `info` (recovery) messages.
- **`environment.ts`** — `environmentFlag` gates the `NODE_RATE_LIMIT_REDIS_ENABLED` kill-switch; `environmentNumber` reads `NODE_CLUSTER_WORKERS` for the misconfiguration warning.
- **`server-lifecycle.ts`** — Calls `stopRateLimitStore()` during graceful shutdown to release the Redis connection.
- **`tests/unit/…/rate-limit-store.test.ts`** / **`rate-limit-store-selection.test.ts`** — Unit tests covering store selection logic and the store's behaviour against a mocked Redis.

## Notes

- The module is intentionally import-safe: no Redis connection is opened at import time. The lazy `store()` factory defers `RedisStore` construction (and its Lua-script `init`) to the first `increment`, and the `.catch()` on that `init` is load-bearing—an unhandled rejection would crash the process on Node 15+.
- A failed `init` also discards the `RedisStore` instance because `rate-limit-redis` caches the rejected script-load promise and would re-await it on every subsequent `increment`, leaving the limiter permanently open until a restart.
- `redisUrl()` uses `||` rather than `??` specifically because `dotenv` loads `NAME=` as `''`, and an empty string should be treated as "not configured."
- The `send` command's generic type (`RedisReply`) is stated explicitly rather than inferred because node-redis returns a wide `ReplyUnion` for arbitrary commands, while `rate-limit-redis` only needs the narrow subset its four commands (`SCRIPT LOAD`, `EVALSHA`, `DECR`, `DEL`) produce.
- Stryker mutator-disable comments surround every `logger` call site and the recovery `onRecovered` callback—these lines are intentionally not covered by mutation testing.
