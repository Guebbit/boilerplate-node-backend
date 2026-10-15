---
source: tests/unit/infrastructure/adapters/cache.test.ts
sha256: e323e33ff9920fa754d3011a54d18457c8794ff6a8ce3935753474ccffb882f1
generated_at: 2026-10-15T13:05:01.787708+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/cache.test.ts

## Purpose

Unit tests for the cache adapter (`@infrastructure/adapters/cache.ts`), covering the two paths the caching middleware depends on: `clearCache` (which must distinguish "nothing to clear" from "could not clear" so `db:cache:clear` can exit non-zero) and the read/write/invalidate trio (`getCacheValue`, `setCacheValue`). The file exists to enforce the adapter's two invariants — fail-open (never reject) and key prefixing (namespace isolation) — without a live Redis.

## Key elements

- **`freshCache()`** — Calls `jest.resetModules()` then `require()`s the adapter, discarding the module-scope memoised Redis client so each test gets an independent connection verdict.
- **`freshObservability()`** — Re-requires `@infrastructure/adapters/logger` and `@infrastructure/observability/metrics-cache` from the *same* fresh module epoch as `freshCache()`, so assertions on `logger` and `cacheInvalidationFailuresTotal` target the instances the adapter actually called.
- **`scanBatches(batches)`** — Wraps a list of string arrays in an `async function*` to satisfy node-redis' `scanIterator` AsyncIterable contract.
- **`describe('clearCache')`** — Six cases: happy-path count, caching-off (no URL), `NODE_REDIS_CACHE_ENABLED=0` kill switch, ECONNREFUSED, mid-scan throw, and "never rejects."
- **`describe('getCacheValue')`** — Hit returns opaque bytes verbatim, namespaced key assertion, `null` → `undefined` miss, Redis rejection → `undefined`, caching-off short-circuit (no `connect` call).
- **`describe('setCacheValue tag index')`** — Tag ZSET expiry (`NX` + `GT`), `SET` with `{ EX }`, per-tag `ZADD` registration, and index pruning via `ZRemRangeByScore`.
- **Module mocks** — `redis.createClient` returns a single `mockClient` (with `isReady: false` to force the connect path); `@infrastructure/adapters/logger` is stubbed to keep passing runs quiet.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — The system under test; re-required per test via `freshCache()`.
- **`src/infrastructure/adapters/logger.ts`** — Mocked at module level to suppress warnings; re-required via `freshObservability()` to spy on invalidation-failure log calls.
- **`src/infrastructure/observability/metrics-cache.ts`** — Re-required via `freshObservability()` to assert `cacheInvalidationFailuresTotal` increments on failure paths.
- **`tests/support/environment.ts`** — Supplies `setEnvironment` to toggle `NODE_REDIS_URL`, `NODE_REDIS_PORT`, and `NODE_REDIS_CACHE_ENABLED` per test without touching process.env directly.

## Notes

- The adapter stores `client` and `connectPromise` at **module scope**, so without `jest.resetModules()` a second test reuses the first test's connection outcome. `freshCache()` / `freshObservability()` exist solely for this.
- `mockClient.isReady` is hardcoded to `false` because the adapter's lifecycle short-circuits on that flag; keeping it false forces the `connect` path where reachability is actually decided.
- `clearMocks: true` is set project-wide, so every `beforeEach` must re-arm mock implementations (`mockConnect`, `mockDel`, etc.) — they do not persist across tests.
- This file deliberately does **not** test the TTL clamp, per-entry byte limit, or response envelope; those live with their sole consumer in `tests/unit/infrastructure/http/middlewares/cache.test.ts`.
- `clearCache` is the **one** adapter function that does *not* collapse fail-open: it must resolve `{ deleted: 0, reachable: false }` (not `{ deleted: 0, reachable: true }`) when Redis is down, so the CLI can exit non-zero.
