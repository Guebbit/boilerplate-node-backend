---
source: tests/unit/scenarios/demo-clock.test.ts
sha256: abe69df2b0dd913541b5bc06852ccae797fd25b9d705f779f780b142ad855ac2
generated_at: 2026-11-08T10:29:22.481214+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/demo-clock.test.ts

## Purpose

Unit tests for the demo clock (`installDemoClock`), verifying that it advances `Date` forward on demand, rejects backward or non-finite jumps, restores real time on reset, and does not interfere with real wall-clock timers.

## Key elements

- **`HOUR_MS` (3 600 000)** — the advance increment used throughout; large enough to distinguish from real-time drift.
- **`DRIFT_MS` (2 000)** — tolerance window added to every time-delta assertion to absorb the real milliseconds that elapse between reads within a test.
- **`describe('the demo clock')`** — installs a fresh clock in `beforeEach`, uninstalls in `afterEach`. Individual `it` blocks cover:
  - starting on real time (`offsetMs()` < DRIFT_MS)
  - advancing `Date.now()` by the requested amount
  - advancing `new Date()` as well (redundant check)
  - accumulation of successive advances
  - rejection of invalid arguments (`-1`, `NaN`, `Infinity`) via `it.each`, asserting a `RangeError`
  - reset returning to real time
  - real `setTimeout` timers still firing on wall time (uses `performance.now()` for the measurement)

## Relationships

- **`scenarios/support/demo-clock.ts`** — the sole import. This test file exercises the public API of `installDemoClock()`: `advance(ms)`, `reset()`, `offsetMs()`, and `uninstall()`. No other module is touched.

## Notes

- Every assertion that compares a computed delta against an expected value is bounded by `DRIFT_MS` on the upper side (or lower side for accumulation). If you tighten timing logic, update both sides of the inequality.
- The "leaves real timers alone" test is the only `async` case; it relies on a 30 ms `setTimeout` and a 20 ms lower bound on `performance.now()` to prove the clock did not stub `setTimeout`.
- `it.each` over `[-1, NaN, Infinity]` is the single place invalid-input behavior is pinned; adding a new invalid case there is the expected extension point.
