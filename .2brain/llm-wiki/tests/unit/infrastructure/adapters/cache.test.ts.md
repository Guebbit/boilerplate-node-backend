---
source: tests/unit/infrastructure/adapters/cache.test.ts
sha256: 0fb764f626e9f97e5a3628c9fc559ef7161f90bbc4af149a1346618fdde93942
generated_at: 2026-09-27T16:03:03.259079+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/cache.test.ts

## Purpose

Unit tests for the cache adapter (`src/infrastructure/adapters/cache.ts`), covering its three public functions—`clearCache`, `getCacheValue`, and `setCacheValue`—and their fail-open behaviour when Redis is unreachable, disabled, or returns errors. The file exists because the adapter previously sat at 48 % coverage with no execution at all on the read/write/invalidate paths.

## Key elements

- **`freshCache()`** – Re-requires the adapter module after `jest.resetModules()` so each test case gets a fresh module-level Redis client and connection promise.
- **`freshObservability()`** – Re-requires `logger` and `metrics-cache` from the *same* fresh epoch so assertions target the instances the adapter actually calls.
- **`scanBatches(batches)`** – Builds an `AsyncIterable` that mimics node-redis `scanIterator` output for `clearCache` tests.
- **`mockClient` / `mockCreateClient`** – A single mock Redis client (`isReady: false`, `isOpen: false`) injected via `jest.mock('redis', …)` to force the connect path where reachable/unreachable is decided.
- **`describe('clearCache')`** – Verifies the `{ deleted, reachable }` contract: reachable-with-count, caching-off short-circuit, `NODE_REDIS_CACHE_ENABLED=0` kill switch, connection-refused, mid-scan socket death, and the "never rejects" guarantee.
- **`describe('getCacheValue')`** – Verifies hit (opaque bytes returned verbatim), namespaced key format (`:key:GET:/…`), miss (`null` → `undefined`), Redis rejection → `undefined`, and caching-off without connecting.
- **`describe('setCacheValue tag index')`** – Verifies `EX`-based TTL on the value key, `NX`/`GT` expiry on each tag set, and `SADD` registration of the entry under every supplied tag (the reverse index that makes group invalidation possible).
- **`afterEach` env restore** – Saves and restores `NODE_REDIS_*` env vars so tests are order-independent.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** – The module under test; imported (via `require`) inside `freshCache()` and exercised for `clearCache`, `getCacheValue`, `setCacheValue`.
- **`src/infrastructure/adapters/logger.ts`** – Mocked at the `jest.mock` level to silence `warn`/`info` calls the adapter makes on every fail-open path; re-required inside `freshObservability()` for direct assertion.
- **`src/infrastructure/observability/metrics-cache.ts`** – `cacheInvalidationFailuresTotal` counter is re-required in `freshObservability()` and available for assertion when invalidation fails.

## Notes

- **Module-scoped memoisation trap:** The adapter stores its Redis client and a `connectPromise` in module-level variables. A plain top-level `import` would share state across tests, which is why every test case goes through `freshCache()` (and observability asserts through `freshObservability()`).
- **`clearMocks: true` interaction:** Jest's config wipes mock implementations between cases, so each `beforeEach` must re-arm `mockConnect`, `mockDel`, `mockScanIterator`, etc.
- **What is deliberately *not* tested here:** TTL clamping, per-entry byte limits, and the response envelope. Those belong to the middleware and are covered in `tests/unit/infrastructure/http/middlewares/cache.test.ts`.
- **`isReady: false` on the mock:** Forces the adapter down the explicit `connect()` path rather than the already-ready shortcut, which is where the reachable/unreachable branch actually lives.
- **`clearCache` is the exception to fail-open:** It must distinguish "0 keys deleted, Redis fine" from "couldn't reach Redis" so the `db:cache:clear` CLI can exit non-zero on genuine failure. All other paths simply resolve to `undefined` or the stored value.
