---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts
sha256: e15803b105dd997628911a615f9eca059e786273d2fcd4e27e941a9c434a61a0
generated_at: 2026-10-15T13:13:47.715490+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts

## Purpose

Unit tests for the `rateLimitStore` factory in the HTTP middleware layer. Covers which store (in-memory vs. Redis) is selected, URL-resolution priority, lazy Redis construction, the missing-config alert, and the fail-open behavior when `RedisStore.init` rejects. Deliberately split from `rate-limit-store.test.ts` because this file mocks `RedisStore` itself to control `init`/`increment` directly, while that sibling drives a real `RedisStore` against a fake low-level client to test the `connecting`-promise handshake.

## Key elements

- **`MockRedisStore`** — stand-in for `rate-limit-redis`'s `RedisStore`; records constructor args (`prefix`), `init`, and `increment` calls while still routing through `sendCommand` so the real client-creation chain is exercised.
- **`freshStore()` / `freshLimits()` / `freshLogger()` / `freshMemoryStore()`** — helpers that `jest.resetModules()` + `require()` a fresh copy of the module under test (and its dependencies) to discard module-scope state (`client`, `connecting`, `degraded`) between cases.
- **`mockSelectionClient` / `mockCreateClient`** — mock the low-level `redis` package so the connection is observable without a real socket.
- **`urlUsedFor()`** — convenience helper that triggers one `increment` and returns the URL passed to `createClient`.
- **`beforeEach`** — resets `connect`, `init`, and `sendCommand` to resolve successfully.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the module under test; `freshStore()` re-requires it each case.
- **`src/infrastructure/adapters/limits-redis.ts`** — re-required via `freshLimits()` so assertions reference the same connection-state copy the store under test used.
- **`src/infrastructure/adapters/logger.ts`** — mocked at module level; `freshLogger()` retrieves the same mock instance for assertions on alert/failure log calls.
- **`tests/support/environment.ts`** — `setEnvironment` is called in every case to explicitly set or clear `NODE_RATE_LIMIT_REDIS_URL`, `NODE_REDIS_URL`, and `NODE_CLUSTER_WORKERS` (the global test setup blanks the rate-limit URL).
- **`src/infrastructure/observability/metrics-rate-limit.ts`** — appears in the dependency graph but is not directly asserted or mocked in this file.

## Notes

- The global test setup (`tests/support/setup-environment.ts`) blanks `NODE_RATE_LIMIT_REDIS_URL` for every test; any case that wants the Redis path must set it explicitly.
- `jest.resetModules()` is mandatory between cases because `rate-limit-store` holds module-scope `client`/`connecting`/`degraded` state. Every re-require (store, limits adapter, logger, `express-rate-limit`) must go through the same reset or `instanceof` checks will compare across two copies of a class and always fail.
- The `express-rate-limit` package is **not** mocked; `freshMemoryStore()` re-requires it to keep the `instanceof` comparison consistent with the copy `rateLimitStore()` actually used.
- The init-failure regression test calls `store.init?.(options)` before `increment` because `express-rate-limit` invokes `init` on the real store before any request arrives — skipping it would exercise a path the middleware never leaves untaken.
- Two microtask turns (`await Promise.resolve()` × 2) are needed after the fire-and-forgotten `init().catch()` before asserting the error log was written.
