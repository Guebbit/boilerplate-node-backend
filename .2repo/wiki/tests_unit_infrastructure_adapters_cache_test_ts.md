# tests/unit/infrastructure/adapters/cache.test.ts

## Purpose

Unit tests for the cache adapter (`src/infrastructure/adapters/cache.ts`). Verifies the two invariants the adapter promises—**fail-open** (every path resolves, never rejects, so a Redis outage degrades to a cache-miss rather than a 500) and **key prefixing** (namespaced keys prevent two deployments sharing a Redis instance from reading each other's entries). Also pins the one exception: `clearCache` must distinguish "nothing to clear" (exit 0) from "could not clear" (exit non-zero).

## Key elements

- **`freshCache()`** — Helper that calls `jest.resetModules()` then `require`s the adapter, discarding the module-level memoised Redis client so each test case gets an independent connection verdict.
- **`scanBatches(batches)`** — Wraps an array of key-arrays as the async iterable that `node-redis`'s `scanIterator` is expected to return.
- **`describe('clearCache', …)`** — Six cases covering: successful count, cache-disabled short-circuit, `NODE_REDIS_CACHE_ENABLED=0` kill switch, connection-refused → `reachable: false`, mid-scan crash → `reachable: false`, and the invariant that the function never rejects.
- **`describe('getCacheValue', …)`** — Five cases covering: verbatim byte return on hit, namespaced key assertion, `null` → `undefined` miss, Redis failure → `undefined` (fail-open), and cache-disabled → no connection attempted.
- **`describe('setCacheValue tag index', …)`** — Cases covering: `SET … EX <ttl>` call shape, reverse tag-index membership via `SADD`, tag de-duplication and empty-tag filtering, write-failure → resolve (not reject), and non-positive TTL guard that short-circuits before any Redis call.
- **Mock setup** — `redis` module mocked (`createClient` → `mockClient` with `isReady: false` to force the connect path); `@infrastructure/adapters/logger` mocked to keep output silent.
- **`ORIGINAL_ENVIRONMENT` / `afterEach`** — Saves and restores the four `NODE_REDIS_*` env vars after every test to prevent cross-contamination.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** (SUT) — The only production dependency under test. This file mocks its sole external I/O (`redis`) and logger, then exercises the adapter's exported functions: `clearCache`, `getCacheValue`, `setCacheValue` (and the tag-invalidation path the file continues to test). The adapter's module-level `client` / `connectPromise` memoisation is the reason for the `freshCache()` re-import pattern.

## Notes

- The adapter memoises its Redis client in **module scope**, so a naive `import` in a second test reuses the first test's connection state. Every `describe` block must call `freshCache()` (not a top-level import) to get a clean client.
- `clearMocks: true` in the Jest config wipes mock implementations between tests; each `beforeEach` must re-arm the happy-path implementations (`mockConnect`, `mockDel`, etc.).
- `isReady` is pinned to `false` on `mockClient` deliberately: if it were `true`, the adapter would skip the connect path entirely and the reachable/unreachable distinction under test would never be exercised.
- This file **no longer** tests the TTL clamp, per-entry byte limit, or response envelope—those were relocated to `tests/unit/infrastructure/http/middlewares/cache.test.ts` when the adapter stopped deciding them.
- The `getRedisUrl` resolution has two routes (`NODE_REDIS_URL` vs. host/port fallback); tests that assert "no connection" must clear **both** to avoid a `.env`-loaded value leaking in.
