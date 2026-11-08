---
source: tests/unit/scripts/testing/machine-budget.test.ts
sha256: 535786365fd62a777187bab54b5306065944cdb86cd2f6d764c0a5f386ef732c
generated_at: 2026-11-08T10:43:41.218781+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/machine-budget.test.ts

## Purpose

Unit tests for the memory-budget and shard-sizing arithmetic that `npm run test:*` relies on. Every function under test decides how much RAM a test suite may consume, so the suite asserts both failure modes: a budget too high lets the OOM killer kill a worker mid-file, and a budget too low makes a strong machine pay unnecessary sharding overhead. A final "two machines" describe block exercises the full pipeline end-to-end against the integration layer's known file count.

## Key elements

- **`INTEGRATION_FILES` (local const, 75)** — the file count of the integration test layer; used in the end-to-end scenarios and as the baseline for shard-count assertions.
- **`describe('positiveInteger')`** — table-driven test that valid integers parse through and everything else (zero, negatives, floats, blanks, non-numeric strings, `undefined`) yields `undefined`.
- **`describe('environmentKnob')`** — verifies that `environmentKnob` reads a real env var, rejects non-positive-integer values, and returns `undefined` for unset names. Uses `setProcessEnvironment` to set/clear vars.
- **`describe('availableMemoryMb')`** — sanity-checks the reported value is positive and ≤ `os.totalmem()`.
- **`describe('processBudgetMb')`** — asserts an explicit override wins and the computed floor is ≥ `MIN_PROCESS_BUDGET_MB`.
- **`describe('shardTargetMb')`** — confirms the upper cap (`MAX_SHARD_PEAK_MB`), pass-through of modest values, and lower floor (`MIN_PROCESS_BUDGET_MB`).
- **`describe('filesPerShard')`** — verifies the per-file retention subtraction and the "never zero" invariant.
- **`describe('shardCount')`** — table of (files, perShard) → expected shard count; asserts shard count never exceeds file count and that 0 files yields 1 shard (broken-invocation guard).
- **`describe('clampShards')`** — pass-through, cap at file count, floor at 1, and 0-files→1-shard behavior.
- **`describe('heapCapMb')`** — single-process pass-through, even division across workers, and floor-division so workers never jointly exceed the budget.
- **`describe('workerCount')`** — override wins, never returns zero, and is bounded by available cores minus a CPU reserve.
- **`describe('the two machines this all exists for')`** — composes `processBudgetMb → shardTargetMb → filesPerShard → shardCount` to prove a 30 GB machine gets 1 shard (no overhead) while a 2600 MB machine gets >1 shard (avoids OOM).

## Relationships

- **`scripts/testing/machine-budget.ts`** — the module under test. All exported functions (`positiveInteger`, `environmentKnob`, `availableMemoryMb`, `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, `heapCapMb`, `workerCount`) and constants (`MAX_SHARD_PEAK_MB`, `MIN_PROCESS_BUDGET_MB`, `PER_FILE_RETENTION_MB`, `PROCESS_BASELINE_MB`) are imported and asserted here.
- **`tests/support/environment.ts`** — supplies `setProcessEnvironment`, which the `environmentKnob` tests call to set and clear the `JEST_WORKERS_TEST_ONLY` variable without mutating the real `process.env` globally.

## Notes

- The two-machine end-to-end block hard-codes `INTEGRATION_FILES = 75`. If the integration layer gains or loses test files, the "roomy machine → 1 shard" and "constrained machine → >1 shard" assertions will need updating.
- `heapCapMb` tests assert floor-division (e.g. 2601 / 4 → 650), not rounding; the comment explicitly notes this prevents workers from jointly exceeding the budget.
- `shardCount(0, n)` and `clampShards(n, 0)` both return 1, not 0 — the design intent is that a "zero files" answer from Jest means a broken `--listTests` invocation, not an empty suite.
- The test for `processBudgetMb`'s floor references the invariant that a budget below `MIN_PROCESS_BUDGET_MB` would compute zero files per shard, producing a green run that tested nothing.
