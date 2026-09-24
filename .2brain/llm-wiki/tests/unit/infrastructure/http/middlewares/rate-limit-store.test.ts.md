---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts
sha256: 61c8ad8a1a0f6ec098bedffe40dc56317d7dcb00603e3f2b2638a5f676f58c90
generated_at: 2026-09-23T20:22:03.187615+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts

## Purpose

Unit test that guards the "one `connect()` per socket" invariant on the rate-limiter's Redis client. It reproduces the exact race that `RedisStore.init()` triggers (two back-to-back Lua script loads before the handshake resolves) and asserts that concurrent commands share a single connection rather than destroying the shared client. Runs with no Redis, no container, and no cluster — the fast gate a contributor hits in `npm test`, complementing the slower `tests/cluster/rate-limit.test.ts`.

## Key elements

- **`fakeClient()`** — factory returning a mock Redis client whose `isReady` stays `false` for 10 ms (simulating the handshake), whose second `connect()` throws `'Socket already opened'`, and whose `sendCommand` answers `SCRIPT LOAD` with a fake SHA and the increment script with `[1, 60000]`.
- **`connectCalls`** — module-scoped counter incremented inside the fake's `connect`; the primary assertion target.
- **`seam`** — a property on `globalThis` (`rateLimitFakeClient`) that the hoisted `jest.mock` factory reads at call time to obtain the current fake client instance.
- **`jest.mock('redis', …)`** — replaces `createClient` so `rate-limit-store` picks up the fake.
- **Test: "opens one socket…"** — fires two `store.increment` calls concurrently; asserts `connectCalls === 1`.
- **Test: "answers both of them…"** — same scenario; asserts both results resolve and `destroy` was never called on the fake.
- **Test: "counts in memory when no Redis is configured"** — sets `NODE_RATE_LIMIT_REDIS_ENABLED=0`; asserts `connectCalls === 0`.
- **`afterEach`** — calls `stopRateLimitStore()` to tear down the singleton between tests.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the unit under test. The test imports `rateLimitStore` (factory / singleton accessor) and `stopRateLimitStore` (cleanup). It also mocks the `redis` package that `rate-limit-store` uses internally.
- **`tests/cluster/rate-limit.test.ts`** — referenced in the file's doc comment as the complementary, slower integration proof (one budget across real forked workers); not imported or executed by this file.

## Notes

- The `globalThis` seam exists because `jest.mock` factories are hoisted above every `const` in the module; the factory cannot close over a local variable and must reach the fake via a property that exists at call time.
- The fake client's `sendCommand` is shaped to satisfy `rate-limit-redis`'s expectations: `SCRIPT LOAD` must return a string SHA, and the increment script must return a two-element array (`[totalHits, resetMs]`).
- The test deliberately does **not** await `store.init` — it fires `void store.init?.(…)` and then immediately issues two increments, reproducing the real interleaving.
- Environment variables (`NODE_RATE_LIMIT_REDIS_ENABLED`, `NODE_RATE_LIMIT_REDIS_URL`) are set in `beforeEach` and mutated in the in-memory test; `stopRateLimitStore` in `afterEach` is the only cleanup (no explicit env reset).
