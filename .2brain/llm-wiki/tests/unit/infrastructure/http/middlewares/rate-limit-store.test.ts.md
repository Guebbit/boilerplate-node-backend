---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts
sha256: 58b30b6c9355b3de034b77ddf032ff88dc9f8314417119e677aa9ea6f4432748
generated_at: 2026-10-15T13:14:00.560919+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts

## Purpose

Unit test guarding the `rateLimitStore` Redis connection against a specific regression: two back-to-back commands issued before the `connect()` handshake finishes both see `isReady === false`, the second `connect()` throws "Socket already opened", and the resulting `destroy()` tears down the shared client the first command still needs. The limiter then silently passes every request unbudgeted. This test reproduces that race with a fake client—no Redis, no container—and runs in the contributor's default `npm test` gate, complementing the slower cluster suite.

## Key elements

- **`fakeClient()`** – Returns a mock Redis client whose `connect()` resolves after 10 ms (keeping `isReady` false in the interim) and throws `'Socket already opened'` on a second call while one is in flight. Also provides a `sendCommand` that answers `SCRIPT LOAD` with a sha string and the increment script with `[totalHits, resetMs]`, the shapes `rate-limit-redis` requires.
- **`connectCalls`** (module-level counter) – Tracks total `connect()` invocations across the fake client to assert exactly one socket was opened.
- **`seam`** (`globalThis.rateLimitFakeClient`) – A `globalThis` property that bridges the `beforeEach` setup to the hoisted `jest.mock` factory, which cannot close over module-scoped `const`s.
- **`jest.mock('redis', …)`** – Replaces `createClient` so it returns the fake client stored on `globalThis`.
- **Test: "opens one socket for commands issued before the handshake finishes"** – Fires `store.increment('a')` and `store.increment('b')` concurrently after `store.init()` and asserts `connectCalls === 1`.
- **Test: "answers both of them rather than destroying the client one is using"** – Same concurrent pair; asserts both results resolve and `destroy` was never called.
- **Test: "counts in memory when no Redis is configured"** – Sets `NODE_RATE_LIMIT_REDIS_URL` to `undefined` and asserts `connectCalls === 0`, confirming the in-memory fallback path is exercised.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** – The module under test. The test imports `rateLimitStore` and exercises its `init` and `increment` methods.
- **`src/infrastructure/adapters/limits-redis.ts`** – Imported for `stopLimitsRedis()`, called in `afterEach` to clean up any state the store may have registered.
- **`tests/support/environment.ts`** – Provides `setEnvironment()` to inject `NODE_RATE_LIMIT_REDIS_URL` (or remove it) per test without mutating `process.env` permanently.

## Notes

- The `globalThis` seam is a workaround for `jest.mock` hoisting: the mock factory runs before any `const` in the file is initialized, so it cannot reference a module-scoped variable directly.
- The fake client's `sendCommand` must return a **string** for `SCRIPT LOAD` and a **two-element array** for the increment call; returning anything else makes `rate-limit-redis` throw before the connection logic is even exercised.
- This test is intentionally paired with `tests/cluster/rate-limit.test.ts` (which proves the end-to-end budget across real forked workers). The cluster test lives in `complete:manual` / CI; this file is the fast gate that catches the same regression locally.
- `store.init?.()` is called with `as never` because the public type expects options the test doesn't care about; the `?.` guards against the init being undefined in the in-memory path.
