---
source: tests/support/clock.ts
sha256: 5aede5179d5d716b87400dae53c44859a6e715594f5d779267871046ee05a30a
generated_at: 2026-09-27T15:59:20.817435+00:00
model: ollama:qwen3.8:27b
---

# tests/support/clock.ts

## Purpose

Provides a controlled wall-clock helper for Jest tests that also interact with a real MongoDB instance. It fakes **only** `Date` (so `Date.now()` / `new Date()` return a pinned value) while leaving every real timer primitive untouched, because the MongoDB driver relies on its own `setTimeout`/`setImmediate`/`nextTick` for heartbeats, socket timeouts, and server selection — freezing those would hang the round-trip.

## Key elements

- **`REAL_TIMERS`** – A const tuple listing every timer primitive Jest's modern fake-timers would otherwise replace (`setTimeout`, `setInterval`, `setImmediate`, `nextTick`, `hrtime`, `performance`, `queueMicrotask`, and their `clear*` counterparts). Passed as `doNotFake` so they stay real.
- **`freezeDate(at: number | Date = Date.now()): void`** – Calls `jest.useFakeTimers({ doNotFake: REAL_TIMERS }).setSystemTime(at)`. Pins `Date` at `at` without affecting any real timer.
- **`advanceDate(ms: number): void`** – Calls `jest.setSystemTime(Date.now() + ms)` to shift the fake clock forward. Does **not** fire or schedule any real timers.

## Relationships

All five graph neighbors are test files that import these helpers to make time-dependent assertions deterministic while still hitting a live Mongo:

- `src/modules/account/tests/contract/api.contract.test.ts`
- `src/modules/account/tests/integration/jwt.test.ts`
- `src/modules/delivery/tests/contract/api.contract.test.ts`
- `src/modules/orders/tests/integration/order-numbering.test.ts`
- `src/modules/orders/tests/integration/service-crud.test.ts`

## Notes

- Pair `freezeDate` with `jest.useRealTimers()` in `afterEach` or a `finally` block to restore the real clock; forgetting this leaks fake-time state into subsequent tests.
- `advanceDate` computes the new target as `Date.now() + ms`, so it advances *relative to the already-frozen instant*, not relative to true wall time.
- Because only `Date` is faked, any code path that reads server-side time (e.g., a Mongo `$now` operator) will **not** be affected — the faking is purely client-side JavaScript.
