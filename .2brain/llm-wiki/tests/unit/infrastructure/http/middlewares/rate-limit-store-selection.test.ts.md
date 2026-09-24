---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts
sha256: 3157de96cc9ee927747b763e21aa34dcb3c90fee01b5b07a58e00c92174cb28f
generated_at: 2026-09-23T20:21:51.612659+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts

## Purpose

Unit tests for the `rateLimitStore` factory, verifying which store is selected (in-process `MemoryStore` vs. `RedisStore`), URL-resolution priority, lazy construction, the missing-configuration alert, and the init-failure fail-open path. It is deliberately split from `rate-limit-store.test.ts` because this file mocks `RedisStore` at the class level, while the sibling drives a real `RedisStore` against a fake low-level redis client to exercise the `connecting`-promise handshake.

## Key elements

- **`MockRedisStore`** — class-level mock replacing `rate-limit-redis`'s `RedisStore`; exposes `init` and `increment` as `jest.fn` while still routing through a mock `sendCommand`, so the full `createClient → send → build` chain is exercised.
- **`mockSelectionClient` / `mockCreateClient`** — stand-in for the low-level `redis` client (`on`, `connect`, `sendCommand`, `destroy`, `quit`); `createClient` is injected via `jest.mock('redis', …)`.
- **`freshStore()` / `freshLogger()` / `freshMemoryStore()`** — helpers that call `jest.resetModules()` + `require()` to obtain a clean module instance, discarding module-scope state (`client`, `connecting`, `degraded`) and avoiding cross-copy `instanceof` failures.
- **`urlUsedFor()`** — helper that triggers one `increment` and returns the URL passed to `createClient`, used by the URL-resolution-priority suite.
- **`ORIGINAL_ENVIRONMENT`** — snapshot of six `NODE_*` env vars restored in `afterEach`.
- **Test suites** — _store selection_ (kill-switch off, no URL, lazy build, memoisation, per-limiter prefix), _missing-config alert_ (logs on multi-worker, silent on single worker), _URL resolution priority_ (`NODE_RATE_LIMIT_REDIS_URL` → `NODE_REDIS_URL` → host+port fallback), _init failure fail-open_ (regression: unhandled rejection must not crash), _`stopRateLimitStore`_.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the module under test. Re-imported fresh on every test case via `freshStore()`; the file asserts on `rateLimitStore()`, `stopRateLimitStore()`, and the internal `client`/`connecting`/`degraded` state.
- **`src/infrastructure/adapters/logger.ts`** — mocked at the module level; re-imported via `freshLogger()` so assertions on `logger.error` / `logger.warn` target the same instance the store module received after `jest.resetModules()`.

## Notes

- The global test setup (`tests/support/setup.ts`) sets `NODE_RATE_LIMIT_REDIS_ENABLED ??= '0'`; every Redis-path test must explicitly set it to `'1'`.
- `express-rate-limit` is **not** mocked. Because `jest.resetModules()` creates a second copy of the module, any `instanceof MemoryStore` check must use `freshMemoryStore()` (re-required in the same tick) rather than the top-level import.
- The init-failure test calls `store.init({ windowMs: 60_000 })` first — `express-rate-limit` does this in production to make `options` truthy, which is what causes the lazy store to call `inner.init(options)`. Omitting it would skip the exact code path being guarded.
- After the rejecting `init()`, the test yields two microtask turns (`await Promise.resolve()` × 2) before asserting the `.catch()` log, since the fire-and-forget handler runs asynchronously.
