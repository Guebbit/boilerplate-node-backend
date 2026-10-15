---
source: tests/unit/scripts/testing/machine-budget.test.ts
sha256: 535786365fd62a777187bab54b5306065944cdb86cd2f6d764c0a5f386ef732c
generated_at: 2026-10-15T13:32:28.487098+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/machine-budget.test.ts

## Purpose

Unit tests for the memory-budget and shard-sizing arithmetic in `scripts/testing/machine-budget.ts`. Every assertion guards against the two failure modes the budget exists to prevent: allocating too much (OOM kill mid-run) or too little (a shard that executes zero files and reports green). A final integration-style block verifies the full pipeline produces one shard on a roomy machine and multiple shards on a constrained one.

## Key elements

- **`describe('positiveInteger')`** — table-driven checks that the string→int parser accepts valid input and returns `undefined` for zero, negatives, floats, blanks, and non-numeric strings.
- **`describe('environmentKnob')`** — verifies `environmentKnob` reads a valid integer from the real process environment and treats `'0'`, `'-1'`, non-numeric, and empty values as *unset* (`undefined`), not as a numeric zero.
- **`describe('availableMemoryMb')`** — asserts the return is positive and ≤ `os.totalmem()`.
- **`describe('processBudgetMb')`** — confirms an explicit override is returned verbatim; the computed floor is ≥ `MIN_PROCESS_BUDGET_MB`.
- **`describe('shardTargetMb')`** — caps at `MAX_SHARD_PEAK_MB`, passes modest values through, and raises sub-floor values to `MIN_PROCESS_BUDGET_MB`.
- **`describe('filesPerShard')`** — subtracts `PROCESS_BASELINE_MB` before dividing; floors the result at 1 for any target (including 0).
- **`describe('shardCount')`** — ceil division of files by per-shard; never exceeds the file count; treats a file count of 0 as 1 shard.
- **`describe('clampShards')`** — passes sane overrides through, caps at the file count (so no shard runs empty), floors at 1, and treats 0 files as 1 shard.
- **`describe('heapCapMb')`** — single process gets full budget; multi-process divides with floor (never ceil) so workers never jointly exceed the budget.
- **`describe('workerCount')`** — explicit override wins; result is ≥ 1 and ≤ `os.cpus().length - cpuReserve`.
- **`describe('the two machines this all exists for')`** — end-to-end pipeline (`processBudgetMb → shardTargetMb → filesPerShard → shardCount`) against the 75-file integration layer: a 30 GB machine yields 1 shard; a 2600 MB machine yields > 1 shard.
- **`INTEGRATION_FILES`** (const, 75) — test-local fixture representing the integration suite's file count; used only in the final describe block.

## Relationships

- **`scripts/testing/machine-budget.ts`** — the module under test. All functions (`positiveInteger`, `environmentKnob`, `availableMemoryMb`, `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, `heapCapMb`, `workerCount`) and constants (`MAX_SHARD_PEAK_MB`, `MIN_PROCESS_BUDGET_MB`, `PER_FILE_RETENTION_MB`, `PROCESS_BASELINE_MB`) are imported from here.
- **`tests/support/environment.ts`** — supplies `setProcessEnvironment`, used exclusively in the `environmentKnob` block to inject a value into the real `process.env` for each test case.

## Notes

- The `environmentKnob` tests use a throwaway variable name (`JEST_WORKERS_TEST_ONLY`) to avoid colliding with real CI configuration.
- The dominant invariant tested across multiple blocks is *never-zero*: `filesPerShard` ≥ 1, `shardCount` ≥ 1, `workerCount` ≥ 1. A zero in any of these would produce a "green" run that tested nothing.
- `heapCapMb` uses floor division (not round) so that N workers × cap ≤ budget; the 2601/4 → 650 case pins this down.
- The final describe block chains four functions together rather than testing them in isolation, making it the only test that can catch a unit-passing but pipeline-failing regression.
