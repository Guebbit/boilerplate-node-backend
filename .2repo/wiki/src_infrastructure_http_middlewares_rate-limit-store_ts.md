# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Provides the storage backend for `express-rate-limit` counters. Because the default in-process `Map` multiplies every budget by the worker count under cluster mode, this file selects a Redis-backed store (shared across workers and instances) when a Redis URL is available, and falls back to `MemoryStore` otherwise. It deliberately uses a **separate** Redis connection from the cache adapter so that disabling the cache never silently disables rate limiting.

## Key elements

- **`rateLimitStore(namespace)`** *(export)* — Entry point. Resolves the Redis URL; returns a lazy `RedisStore` if one is available, or a `MemoryStore` (logging at `error` level when cluster workers > 1).
- **`stopRateLimitStore()`** *(export)* — Releases the shared Redis connection on shutdown so a restart begins from a clean socket.
- **`KEY_PREFIX`** — Redis key namespace (default `'rate-limit'`), independent of the cache prefix so a cache flush doesn't reset budgets.
- **`redisUrl()`** — Resolves the limiter's Redis URL via a fallback chain: explicit `NODE_RATE_LIMIT_REDIS_URL` → inherited `NODE_REDIS_URL` → composed from `NODE_REDIS_HOST`/`NODE_REDIS_PORT`. Honors the `NODE_RATE_LIMIT_REDIS_ENABLED` kill-switch flag.
- **`build(url)`** — Creates a node-redis client with `reconnectStrategy: false` and a mandatory `error` listener (prevents unhandled-EventEmitter crash).
- **`connectionFor(url)`** — Memoized `ManagedConnection` shared by all limiters. Fails **closed** (`getOrThrow` rejects) and logs at `error` on unavailability. Reuses the same client across connect attempts (node-redis rejects a second `connect()` on an open socket).
- **`send(url, command)`** — Executes one raw Redis command. On failure destroys the client, forgets the connection, reports unavailability, and rethrows (caller turns this into fail-open).
- **`lazyRedisStore(namespace, url)`** — Wraps `RedisStore` so `init` (which loads Lua scripts / opens a connection) is deferred to the first `increment` call, keeping module import side-effect-free. The `init().catch()` is load-bearing to avoid a fatal unhandled rejection.

## Relationships

- **`rate-limit.ts`** — The sole consumer. Calls `rateLimitStore(namespace)` per limiter and sets `passOnStoreError: true`, converting the rejections this file throws into "let the request through."
- **`managed-connection.ts`** — Supplies the `manageConnection` lifecycle (memoised handle, deduped connect, warn-once, `forget`, `stop`) that `connectionFor` delegates to.
- **`environment.ts`** — Provides `environmentFlag` (the `NODE_RATE_LIMIT_REDIS_ENABLED` kill-switch) and `environmentNumber` (worker-count check for the `MemoryStore` warning).
- **`logger.ts`** — Emits `info` on Redis recovery and `error` on unavailability / failed store init / per-process counting warning.
- **`server-lifecycle.ts`** — Calls `stopRateLimitStore()` during graceful shutdown.
- **`rate-limit-store-selection.test.ts`** — Unit-tests the store-selection logic (Redis vs. Memory, kill-switch, URL fallback).
- **`rate-limit-store.test.ts`** — Unit-tests store behavior (lazy init, send/fail-open, connection reuse, `stopRateLimitStore`).

## Notes

- **Fail-open, not fail-closed.** Unlike the cache adapter, an unavailable Redis causes requests to pass through unbudgeted rather than returning 500. The rationale is stated in the module header: an infrastructure blip should not become an authentication outage.
- **No reconnect loop.** `reconnectStrategy: false` is intentional — a retry loop would keep the event loop alive after the process should exit. One clean try per command; the next command starts from a fresh socket.
- **Explicit integer reply type.** `sendCommand<RedisReply>` is stated rather than inferred; only `INCR`, `DECR`, `PTTL`, `DEL` are ever issued, all of which return integers.
- **Client reuse across connect attempts.** Unlike the cache adapter, a new client is *not* created per attempt — node-redis throws `Socket already opened` if a second `connect()` races the first. The existing client is destroyed and a fresh one built only after a definitive failure.
- **Lazy `init` is critical.** `RedisStore.init` loads Lua scripts (a network round-trip). Deferring it past module load keeps `import` safe in tests and SSR contexts.
- **`forget()` wrapper.** The memoized `redisConnection.forget` is overridden to also reset the local `redisClient` reference, ensuring the next connect attempt builds a fresh client rather than reusing a destroyed one.
