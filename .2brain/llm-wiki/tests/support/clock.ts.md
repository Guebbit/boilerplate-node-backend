---
source: tests/support/clock.ts
sha256: 5aede5179d5d716b87400dae53c44859a6e715594f5d779267871046ee05a30a
generated_at: 2026-11-08T09:52:31.527542+00:00
model: ollama:qwen3.8:27b
---

# tests/support/clock.ts

## Purpose

Provides a controlled wall clock for tests that also talk to a real MongoDB instance. It freezes `Date` (via Jest fake timers) while deliberately leaving every real timer primitive untouched, so the Mongo driver's internal timers (heartbeats, socket timeouts, server selection) keep running and the round-trip does not hang.

## Key elements

- **`REAL_TIMERS`** — A frozen array of the timer primitives (`setTimeout`, `setInterval`, `nextTick`, `performance`, `queueMicrotask`, etc.) that Jest's modern fake timers would otherwise replace. Used as the `doNotFake` list.
- **`freezeDate(at?)`** — Activates Jest modern fake timers with all `REAL_TIMERS` excluded, then pins the system clock to `at` (defaults to current time). Call `jest.useRealTimers()` in teardown to restore.
- **`advanceDate(ms)`** — Moves the already-frozen clock forward by `ms` milliseconds without waiting in real time and without firing any scheduled callbacks.

## Relationships

Imported by integration and contract tests across every domain module (account, api-keys, cart, delivery, invoicing, orders) that exercises time-sensitive logic against a live Mongo connection. Examples include session-mode, JWT expiry, credit-note issuance, and order export tests. All of them use `freezeDate`/`advanceDate` to assert "now"-dependent behaviour without sleeping.

## Notes

- Must be paired with `jest.useRealTimers()` in an `afterEach` or `finally`; the module does **not** auto-restore.
- Only `Date` is faked. Do not add `setTimeout` or `setImmediate` to the fake set — the Mongo driver depends on real timers for heartbeats and server selection, and freezing them will deadlock the test.
- `advanceDate` does **not** execute any pending `setTimeout`/`setInterval` callbacks; it only shifts the reported wall time.
