# tests/unit/infrastructure/http/middlewares/rate-limit-store.test.ts

## Purpose

Unit test guarding a specific race in the Redis-backed rate-limit store: two `init()`-triggered Lua script loads issued back-to-back must not each call `connect()` on the same socket. It reproduces the exact node-redis handshake interleaving (fake client where `isReady` stays false until the promise resolves) and asserts a single `connect()` call plus no destructive `destroy()`. It exists to catch that regression in the fast, container-free `npm test` gate, complementing the slower cluster suite in `tests/cluster/rate-limit.test.ts`.

## Key elements

- **`fakeClient()`** — factory returning a duck-typed client whose `connect()` rejects a second call while one is in flight (throwing `'Socket already opened'`), `sendCommand` answers `SCRIPT LOAD` with a sha and the increment script with `[1, 60_000]`, and `destroy()` flips internal state. Mimics only the window where node-redis misbehaves.
- **`seam`** — a `globalThis`-attached property (`rateLimitFakeClient`) that the hoisted `jest.mock('redis', …)` factory reads at call time, working around jest's hoisting constraint.
- **`jest.mock('redis', …)`** — replaces `createClient` so the module under test gets the fake.
- **`describe('the rate limiter's Redis connection')`** block with three `it` cases:
  - *opens one socket for commands issued before the handshake finishes* — fires `store.init` then two concurrent `increment` calls; asserts `connectCalls === 1`.
  - *answers both of them rather than destroying the client one is using* — asserts both promises resolve and `destroy` was never called.
  - *counts in memory when no Redis is configured* — disables the env flags; asserts zero `connect` calls (guard against the test passing vacuously).
- **`connectCalls`** — module-level counter incremented inside the fake's `connect` spy.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit-store.ts`** — imports `rateLimitStore` and `stopRateLimitStore` under test. The test drives `rateLimitStore('unit')` to obtain the store instance, calls `store.init` and `store.increment`, and tears down via `stopRateLimitStore()` in `afterEach`.

## Notes

- The `jest.mock` factory is hoisted above all module-scope `const`s, so it cannot close over `fakeClient` directly; the `globalThis` seam is the workaround. Any refactoring that renames or relocates `seam` will silently break the mock.
- `store.init` is called with `{ windowMs: 60_000 } as never` — the `as never` suppresses a type error on a parameter the test intentionally under-specifies.
- `afterEach` calls `stopRateLimitStore()` to release the client between tests; forgetting it would let a stale fake leak into the next case.
- The test sets `NODE_RATE_LIMIT_REDIS_ENABLED` and `NODE_RATE_LIMIT_REDIS_URL` env vars in `beforeEach`; the third case deletes/overrides them. Ensure no other test file running in the same worker relies on the opposite defaults without resetting.
