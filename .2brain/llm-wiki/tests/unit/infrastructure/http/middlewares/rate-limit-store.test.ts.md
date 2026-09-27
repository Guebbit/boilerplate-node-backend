---
source: tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts
sha256: e9151c0fe9ea405edd65ddd9084ac62681f322a73e5cb730dac006506e81a9d7
generated_at: 2026-09-27T16:07:33.374701+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts

## Purpose

Guards a specific regression in the rate-limit store: when two `connect()` calls race during the Redis handshake (the pattern `RedisStore.init()` triggers by loading two Lua scripts back-to-back), node-redis rejects the second call and the failure path destroys the shared client, silently disabling the rate limiter. This test reproduces that race without Redis, a container, or a cluster, so the fix stays covered by `npm test` while the slower cluster suite (`tests/cluster/rate-limit.test.ts`) runs only in CI.

## Key elements

- **`connectCalls`** — module-level counter incremented by the fake client's `connect` to assert exactly one socket is opened.
- **`fakeClient()`** — returns a mock Redis client whose `isReady` getter stays `false` until a 10 ms timer resolves; a second `connect()` while one is in-flight throws `'Socket already opened'`, mirroring real node-redis behavior. Also stubs `sendCommand` to answer `SCRIPT` with a SHA and increments with `[totalHits, resetMs]`.
- **`seam`** — a typed alias of `globalThis` carrying an optional `rateLimitFakeClient` property. Exists solely so the hoisted `jest.mock` factory can reference the fake client at call time (it cannot close over module-scoped `const`s).
- **`jest.mock('redis', …)`** — replaces `createClient` with a function that returns `seam.rateLimitFakeClient`.
- **`describe('the rate limiter's Redis connection')`** — three tests:
  - *opens one socket for commands issued before the handshake finishes* — fires two concurrent `increment` calls, asserts `connectCalls === 1`.
  - *answers both of them rather than destroying the client one is using* — asserts both promises resolve and `destroy` is never called.
  - *counts in memory when no Redis is configured* — sets `NODE_RATE_LIMIT_REDIS_ENABLED=0`, asserts zero `connect` calls.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — the module under test. The test imports `rateLimitStore` (factory) and `stopRateLimitStore` (teardown called in `afterEach`). All assertions are on the behavior of these exports.
- **`tests/cluster/rate-limit.test.ts`** (referenced in the header comment) — the integration counterpart that proves the same property across real forked workers. This file exists because that test is gated behind `complete:manual` / CI and does not run in the contributor-facing `npm test`.

## Notes

- The `globalThis` seam is a workaround for Jest's factory hoisting: `jest.mock` callbacks execute before any `const` in the module is initialized, so a module-scoped variable would be `undefined` when the factory reads it. A `globalThis` property sidesteps this.
- `void store.init?.({ windowMs: 60_000 } as never)` is deliberately fire-and-forget: the test needs `init` to start (triggering the two script loads) but does not await it, which is precisely what creates the race under test.
- `afterEach` calls `stopRateLimitStore()` to prevent a leaked client from leaking into the next test's `connectCalls` count.
- The fake client's 10 ms handshake delay is the minimum needed to overlap the two concurrent `increment` calls; it is not a realistic Redis latency.
