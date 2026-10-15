---
source: tests/unit/scenarios/demo-clock.test.ts
sha256: abe69df2b0dd913541b5bc06852ccae797fd25b9d705f779f780b142ad855ac2
generated_at: 2026-10-15T13:23:50.518105+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/demo-clock.test.ts

## Purpose

Unit tests for the demo clock (`installDemoClock`). Verifies the clock's contract: it advances `Date` on request, rejects backward/invalid jumps, resets to wall time, and leaves real timers (`setTimeout`) untouched.

## Key elements

- **`HOUR_MS`** (3 600 000) – advance magnitude used across tests; large enough to distinguish from real-time drift.
- **`DRIFT_MS`** (2 000) – tolerance window for real milliseconds that elapse between two reads in a test.
- **`describe('the demo clock')`** – top-level suite. `beforeEach` installs a fresh clock via `installDemoClock()`; `afterEach` calls `clock.uninstall()` to restore the original `Date`.
- **Test cases** – cover: initial offset ≈ 0; single advance; `new Date()` advancement; cumulative advances; rejection of `-1`, `NaN`, `Infinity` (each throws `RangeError`); reset back to real time; and that `setTimeout` still fires on wall time (asserted via `performance.now()`).

## Relationships

- **`scenarios/support/demo-clock.ts`** – the sole import. The test imports `installDemoClock` from that module and exercises its returned API (`advance`, `reset`, `offsetMs`, `uninstall`). The test adds no logic of its own beyond assertions.

## Notes

- Cleanup uses `clock.uninstall()` (restores the *original* `Date`), not `clock.reset()`. Mixing these up in a new test would leave the patched `Date` in place for subsequent suites.
- The "real timers stay real" test intentionally uses `performance.now()` and a 30 ms `setTimeout` rather than `Date.now()`, so it verifies the timer path independently of the clock offset.
- All offset assertions use `toBeGreaterThanOrEqual` / `toBeLessThan` with `DRIFT_MS` slack rather than exact equality, because wall-time ticks between the two reads are unavoidable.
