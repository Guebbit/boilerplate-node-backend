---
source: tests/unit/infrastructure/adapters/cache.test.ts
sha256: 7b68155cd586e79cafd9e9b0f026fd7cd49dccc52db0b8500af2cae76f2683ad
generated_at: 2026-09-23T20:16:34.797106+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/adapters/cache.test.ts

## Purpose

Unit tests for the cache adapter (`@infrastructure/adapters/cache`). The file verifies the two invariants the adapter must uphold — **fail open** (every path resolves, never rejects, when Redis is unreachable) and **key prefixing** (every Redis key is namespaced so co-tenant deployments cannot collide) — and, critically, that `clearCache` distinguishes "nothing to clear" from "could not clear" so the `db:cache:clear` CLI can exit non-zero. It also covers the `getCacheValue` / `setCacheValue` read-write path and the tag-index bookkeeping that makes group invalidation possible.

## Key elements

- **`freshCache()`** — calls `jest.resetModules()` then synchronously `require`s the adapter. Necessary because the adapter memoises its Redis client (`client`, `connectPromise`) at module scope; a second test case would otherwise reuse the first case's connection verdict.
- **`freshObservability()`** — re-requires `@infrastructure/adapters/logger` and `@infrastructure/observability/metrics-cache` from the _same_ fresh module epoch, so assertions on `logger.warn` and `cacheInvalidationFailuresTotal` target the instances the adapter actually touched.
- **`scanBatches(batches)`** — wraps an array of key-batch arrays into an `AsyncIterable`, matching the shape `node-redis`' `scanIterator` yields.
- **Mock `redis` module** — `jest.mock('redis', …)` replaces `createClient` with a factory returning a single `mockClient` whose `isReady` is pinned to `false`, forcing every path through the connect branch where reachable/unreachable is actually decided.
- **Mock `@infrastructure/adapters/logger`** — silences the adapter's warning logs on unreachable paths.
- **`ORIGINAL_ENVIRONMENT` / `afterEach`** — snapshots and restores the four `NODE_REDIS_*` env vars so cases can independently toggle the cache on/off.
- **`describe('clearCache')`** — asserts the `{ deleted, reachable }` contract across reachable, cache-off (URL absent or `NODE_REDIS_CACHE_ENABLED=0`), connect-refused, and mid-scan failure.
- **`describe('getCacheValue')`** — asserts byte-verbatim return on hit, namespaced key format, `undefined` on miss / Redis failure / cache-off, and that no connection is attempted when disabled.
- **`describe('setCacheValue tag index')`** — asserts TTL is passed as `EX`, the tag reverse-index (`SADD`) is written per tag, duplicate/empty tags are de-duplicated, and the write path resolves (not rejects) on failure.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — the module under test. Re-required via `freshCache()` rather than top-level-imported, because of the module-scope memoised client.
- **`src/infrastructure/adapters/logger.ts`** — mocked at module level to suppress warnings; additionally re-required in `freshObservability()` to assert on `logger.warn` calls made inside `invalidateCacheTagsLogged`.
- **`src/infrastructure/observability/metrics-cache.ts`** — re-required in `freshObservability()` to assert the `cacheInvalidationFailuresTotal` counter increments on the unreachable-invalidate path.

## Notes

- `jest.resetModules()` + synchronous `require` (hence the `eslint-disable` for `@typescript-eslint/no-require-imports`) is the _only_ way to get a clean adapter instance per test; a plain re-import would share state.
- The project's Jest config sets `clearMocks: true`, so every `beforeEach` must re-arm `mockConnect` / `mockSet` / `mockSAdd` implementations — they are wiped between cases.
- The adapter's TTL clamp, per-entry byte limit, and response-envelope logic are deliberately **not** tested here; they belong to the caching middleware and are covered in `tests/unit/infrastructure/http/middlewares/cache.test.ts`.
- The file previously sat at ~48 % coverage because the `getCacheValue` / `setCacheValue` / invalidate branches had zero execution under the mutation runner (no real Redis available). These tests close that gap with the `redis` module fully mocked.
