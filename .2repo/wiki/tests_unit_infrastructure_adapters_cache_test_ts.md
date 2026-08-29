# tests/unit/infrastructure/adapters/cache.test.ts

## Purpose

Unit tests for the Redis-backed cache adapter (`src/infrastructure/adapters/cache.ts`). They verify the adapter's three public surfaces — `clearCache`, `getCacheValue`, and `setCacheValue` (including tag-index registration) — with a fully mocked `redis` client, covering the two governing invariants: fail-open (every path resolves, never rejects) and key prefixing (namespaced keys prevent cross-deployment leakage).

## Key elements

- **`freshCache()`** — helper that calls `jest.resetModules()` then `require()`s the adapter, discarding its module-scoped memoised client and connect promise so each test case gets an independent connection verdict.
- **`scanBatches(batches)`** — converts an array of key-batches into an `AsyncIterable`, matching node-redis' `scanIterator` contract.
- **`describe('clearCache')`** — asserts the `{ deleted, reachable }` discriminated result; pins the distinction between "caching off / nothing to clear" (`reachable: true, deleted: 0`) and "Redis refused" (`reachable: false`). Also asserts the function never rejects.
- **`describe('getCacheValue')`** — covers hit (returns stored bytes verbatim), miss (resolves `undefined`), Redis failure (resolves `undefined`), key namespacing (asserts the key contains `:key:` prefix), and the kill-switch path (no connection attempted).
- **`describe('setCacheValue tag index')`** — verifies `SET` with `EX` expiry, `SADD` registration per tag, de-duplication and empty-tag filtering, fail-open on write rejection, and the non-positive-TTL guard (no `SET`, no `SADD`, no `connect`).
- **Module-level mocks** — `jest.mock('redis')` and `jest.mock('@infrastructure/adapters/logger')`; all Redis commands (`on`, `connect`, `scanIterator`, `del`, `set`, `sAdd`, `get`, `sMembers`, `quit`, `destroy`) are individual `jest.fn()`s.
- **`ORIGINAL_ENVIRONMENT` / `afterEach`** — snapshots and restores the four `NODE_REDIS_*` env vars so tests don't leak configuration.

## Relationships

- **`src/infrastructure/adapters/cache.ts`** — the sole unit under test. The test file mocks the `redis` and logger dependencies of that module, exercises its three exported functions, and asserts on the exact Redis command sequences (argument shapes, call ordering) the adapter issues.

## Notes

- The adapter memoises its Redis client and connect promise at **module scope**. Without `jest.resetModules()` + `require()` per case, the second test would inherit the first test's connection state. This is why `freshCache()` exists and why the file cannot use a top-level `import`.
- `clearMocks: true` (likely set in jest config) wipes mock implementations between cases; each `beforeEach` re-arms the happy-path implementations (`connect`, `del`, `scanIterator`, etc.).
- The file explicitly **excludes** TTL clamping, per-entry byte limits, and response-envelope logic — those belong to the middleware test (`tests/unit/infrastructure/http/middlewares/cache.test.ts`) because the adapter no longer makes those decisions.
- `mockClient.isReady` is kept `false` so the adapter takes the `connect()` path rather than the already-connected short-circuit; this is where the reachable/unreachable branch is actually decided.
- Tag de-duplication is asserted by `mockSAdd` call count, not by argument equality, to confirm no wasted round-trips and no junk empty-tag keys.
