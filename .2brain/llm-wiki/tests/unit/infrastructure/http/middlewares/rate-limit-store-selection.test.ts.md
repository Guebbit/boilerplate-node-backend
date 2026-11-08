---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts
sha256: 6c8f2e680769d65812b3029e4794c2837e590df5ea009d05238571eaf9befaf8
generated_at: 2026-11-08T10:15:59.079680+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store-selection.test.ts

## Purpose

Verifies the store-selection logic of the `rateLimitStore` middleware: which store (in-process `MemoryStore` vs. `RedisStore`) gets built, URL-resolution priority, lazy Redis construction, the missing-config alert, and the init-failure fail-open regression. It is deliberately a sibling of `rate-limit-store.test.ts` (which drives a real `RedisStore` against a fake low-level `redis` client for the `connecting`-promise race) because this file mocks `RedisStore` itself to control `init`/`increment` directly. The two cannot coexist in one file due to the one-`jest.mock('rate-limit-redis')`-per-file constraint.

## Key elements

- **`MockRedisStore`** – Stand-in for `rate-limit-redis`'s `RedisStore`. Its constructor records the `prefix` option; `increment` calls `this.sendCommand('INCR', key)` to exercise the same `createClient` → `sendCommand` chain production uses.
- **`freshStore()` / `freshLimits()` / `freshLogger()` / `freshMemoryStore()`** – Helpers that call `jest.resetModules()` then `require()` the target module so that module-scope state (`client`, `connecting`, `degraded`) is discarded and `instanceof` comparisons see the same class copy the module under test actually used.
- **`urlUsedFor()`** – Helper that triggers a count and returns the `url` passed to `createClient`, used to assert which Redis endpoint the limiter dials.
- **Test suites** – "which store gets built" (MemoryStore fallback, lazy construction, memoisation, per-limiter prefix), "the missing-config alert" (logger error when multi-worker with no limits URL), "which URL the limits connection dials" (`NODE_RATE_LIMIT_REDIS_URL` priority, empty-string-as-unset), "an init failure fails open" (unhandled-rejection regression), "a failed init does not disable the limiter for good" (fresh store on next count).

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – The module under test. Re-required via `freshStore()` after each `jest.resetModules()` to get a clean copy of its module-scope connection state.
- **`src/infrastructure/adapters/limits-redis.ts`** – Re-required via `freshLimits()` so assertions on connection state see the same module instance the store just built.
- **`src/infrastructure/adapters/logger.ts`** – Mocked at the top level; re-required via `freshLogger()` in each case to assert on `error`/`warn` calls from the correct module copy.
- **`tests/support/environment.ts`** – Provides `setEnvironment`, used to set or clear `NODE_RATE_LIMIT_REDIS_URL`, `NODE_REDIS_URL`, and `NODE_CLUSTER_WORKERS` before each case (the global setup blanks the limits URL, so tests must set it explicitly).

## Notes

- `jest.resetModules()` + synchronous `require()` is mandatory here because `rate-limit-store.ts` holds `client`, `connecting`, and `degraded` at module scope; a simple import would share stale state across cases. The same pattern is used in `cache.test.ts`, and the top-level `const` declarations in this file are type-scoped via `import type` to avoid a name collision with that sibling.
- `express-rate-limit` is **not** mocked. After `jest.resetModules()` it is a fresh copy, so `instanceof MemoryStore` checks must use `freshMemoryStore()` (re-required) rather than a top-level import, or the comparison silently fails across two class identities.
- The init-failure regression test calls `store.init(options)` explicitly before `increment`. This mirrors what `express-rate-limit` does on the real `Store` before any request increments it; skipping it would exercise a code path the middleware never leaves untaken.
- `NODE_RATE_LIMIT_REDIS_URL` set to an empty string `''` is treated the same as `undefined` (falls back to `MemoryStore`), matching how `.env` files write unset values.
