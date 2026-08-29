# src/infrastructure/http/middlewares/rate-limit-store.ts

## Purpose

Provides a shared, lazy-initialising Redis-backed store for `express-rate-limit` counters so that rate-limit budgets are enforced across all worker processes and instances rather than per-process. Falls open (passes requests through) when Redis is unreachable, logging the outage once at error severity.

## Key elements

- **`KEY_PREFIX`** – Redis key namespace (`NODE_REDIS_RATE_LIMIT_PREFIX`, default `'rate-limit'`), separate from the cache prefix so a cache flush does not reset budgets.
- **`redisUrl()`** – Resolves the limiter's Redis URL from `NODE_RATE_LIMIT_REDIS_URL`, `NODE_REDIS_URL`, or a composed host/port. Honours the `NODE_RATE_LIMIT_REDIS_ENABLED` kill switch (defaults `true`). Returns `undefined` when the limiter should use in-memory storage.
- **`client` / `connecting` / `degraded`** – Module-level state for a single shared node-redis connection, its in-flight `connect()` promise, and a once-per-outage logging flag.
- **`build(url)`** – Creates a node-redis client with `connectTimeout: 1000`, `reconnectStrategy: false`, and a mandatory `'error'` listener to prevent process crashes.
- **`send(url, command)`** – Opens the connection on first use, coalesces concurrent `connect()` calls via `connecting`, sends a raw command, logs recovery on success, and on failure discards the client (next command starts fresh) and logs the outage once at `error` level.
- **`lazyRedisStore(namespace, url)`** – Returns an `express-rate-limit` `Store` whose `RedisStore` is constructed on the first `increment` call rather than at module load. Replays stored `Options` through `init()` (with a `.catch` to avoid unhandled-rejection crashes) and delegates `increment`/`decrement`/`resetKey`/`get` to the inner store.
- **`createStore(namespace)`** *(truncated in source)* – The public entry point: selects Redis or `MemoryStore` based on whether `redisUrl()` returned a value, passing the result to the limiter middleware.

## Relationships

- **`security.ts`** – The consumer. Imports the store factory and configures `passOnStoreError: true` on `express-rate-limit`, which turns the `send()` rejection into "allow the request" rather than a 500.
- **`logger.ts`** – Used for the once-per-outage `error` log, the recovery `info` log, and the `init`-failure `error` log.
- **`environment.ts`** – Source of `environmentFlag` (for `NODE_RATE_LIMIT_REDIS_ENABLED`) and `environmentNumber` (used elsewhere in the module for numeric config).
- **`server-lifecycle.ts`** – Governs when the process exits; relevant because this file's no-reconnect / lazy-connection design ensures a process that never serves a request does not hold an open socket or block the event loop.
- **`rate-limit-store-selection.test.ts`** – Verifies the Redis-vs-memory selection logic (enabled/disabled flag, URL fallback chain).
- **`rate-limit-store.test.ts`** – Exercises the lazy connection, fail-open behaviour, and single-connection concurrency guard.

## Notes

- The `connecting` promise exists to prevent a double-`connect()` race: without it, two commands arriving before the handshake completes each call `connect()`, the second receives "Socket already opened", its error path destroys the shared client, and the first command then fails with "The client is closed".
- `reconnectStrategy: false` is intentional: a background retry loop keeps the event loop alive and prevents clean process exit in scripts that import the limiter but never serve a request.
- `passOnStoreError` (set in `security.ts`) is the mechanism that converts a `send()` rejection into a pass-through; this file does not itself decide whether to allow or deny.
- The store is chosen **once** at startup. A store that swapped between Redis and memory mid-window would reset counters on each swap, effectively disabling the limiter.
