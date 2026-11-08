---
source: tests/unit/infrastructure/adapters/cache.test.ts
sha256: b86e82ad9cd827f13fdb34dd0b237c1490a80519a39d39651f9bca27ca3ff69e
generated_at: 2026-11-08T10:05:51.942797+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/cache.test.ts

## Purpose

Unit tests for the Redis cache adapter (`src/infrastructure/adapters/cache.ts`), covering `clearCache`, `getCacheValue`, and `setCacheValue`. The file exists because those three functions previously had **zero** execution coverage (no Redis available in the unit suite), leaving the adapter at 48%. It verifies two invariants the adapter must uphold: **fail open** (every path resolves, never rejects) and **key namespacing** (all keys are prefixed so shared Redis instances stay isolated).

## Key elements

- **`freshCache()`** — calls `jest.resetModules()` then synchronously `require()`s the adapter so each test case gets a clean module-scope Redis client and connection promise (the adapter memoises both).
- **`freshObservability()`** — re-requires `logger` and `cacheInvalidationFailuresTotal` from the *same* fresh module epoch, since top-level imports would be stale after `resetModules`.
- **`scanBatches(batches)`** — wraps a list of key arrays into an async iterable, mimicking node-redis' `scanIterator` return type.
- **`mockClient` / `mockCreateClient`** — hand-rolled Redis client mock; `isReady` is kept `false` to force every test through the `connect()` path where reachable/unreachable is decided.
- **`describe('clearCache')`** — asserts the `{ deleted, reachable }` contract: happy path count, caching-off (no connect), kill-switch, `ECONNREFUSED`, mid-scan socket death, and the "never rejects" guarantee.
- **`describe('getCacheValue')`** — hit (opaque bytes returned verbatim), namespaced key assertion, `null` → `undefined` on miss, Redis reject → `undefined`, and caching-disabled short-circuit.
- **`describe('setCacheValue tag index')`** — tag-set TTL (`EXPIRE NX` + `GT`), key `SET` with `EX`, per-tag `ZADD` membership (the reverse index that enables group invalidation), and tag-score-based cleanup via `ZREMRANGEBYSCORE`.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — the module under test; every `describe` block exercises its exported functions through `freshCache()`.
- **`src/infrastructure/adapters/logger.ts`** — mocked at module level to silence the adapter's `warn` calls on every unreachable path; also re-required via `freshObservability()` for assertions.
- **`src/infrastructure/observability/metrics-cache.ts`** — provides `cacheInvalidationFailuresTotal`, the Prometheus counter the adapter increments on failed invalidation; accessed only through `freshObservability()`.
- **`tests/support/environment.ts`** — `setEnvironment` is the sole mechanism for toggling `NODE_REDIS_URL`, `NODE_REDIS_PORT`, and `NODE_REDIS_CACHE_ENABLED` per test case.

## Notes

- **`jest.resetModules()` is mandatory** between cases. Without it, the second test reuses the first test's cached `connectPromise` and `client`, so a "unreachable" case would silently inherit a "reachable" verdict.
- **`clearMocks: true`** (jest config) wipes mock implementations after each test; every `beforeEach` must re-arm the happy-path `mockImplementation`s or tests fail with "not a function."
- **`require` over `import`** inside the `fresh*` helpers is a deliberate exception to the `@typescript-eslint/no-require-imports` rule — `jest.resetModules` only invalidates the synchronous `require` cache.
- This file **deliberately omits** TTL clamping, per-entry byte limits, and the response envelope; those concerns are asserted in `tests/unit/infrastructure/http/middlewares/cache.test.ts` where the only consumer lives.
- The `NODE_REDIS_CACHE_ENABLED=0` kill-switch test sets a valid `NODE_REDIS_URL` first to prove the flag alone is sufficient to short-circuit, independent of URL resolution.
