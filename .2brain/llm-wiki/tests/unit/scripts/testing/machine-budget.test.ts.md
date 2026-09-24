---
source: tests/unit/scripts/testing/machine-budget.test.ts
sha256: c4a3be4b9060e754c1aa37d60c4c9cf0407c01ed57b254c34e981f75a0bc8f4a
generated_at: 2026-09-23T20:32:05.762939+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/testing/machine-budget.test.ts

## Purpose

Unit tests for the sizing arithmetic in `scripts/testing/machine-budget.ts`. Every assertion guards one of two failure modes: a budget too high (OOM killer terminates a worker mid-file) or too low (a fast machine pays unnecessary sharding overhead). The suite asserts both directions for each function.

## Key elements

- **`positiveInteger`** – parses a string into a positive `int`; returns `undefined` for zero, negatives, floats, blanks, and non-numeric input.
- **`environmentKnob`** – reads a named env var; tests confirm invalid values (`'0'`, `'-1'`, `'plenty'`, `''`) are treated as _unset_ rather than as a value. Uses a test-only var name (`JEST_WORKERS_TEST_ONLY`) and cleans up in `afterEach`.
- **`availableMemoryMb`** – asserts the returned figure is positive and never exceeds `os.totalmem()`.
- **`processBudgetMb`** – explicit override wins; computed value is floored at `MIN_PROCESS_BUDGET_MB`.
- **`shardTargetMb`** – caps at `MAX_SHARD_PEAK_MB`, passes modest values through, raises values below the floor.
- **`filesPerShard`** – subtracts `PROCESS_BASELINE_MB` before dividing by `PER_FILE_RETENTION_MB`; never returns zero.
- **`shardCount`** – ceiling division of file count by files-per-shard; clamps to `[1, fileCount]`; treats `0` files as 1 shard.
- **`clampShards`** – caps an override at the file count (prevents empty shards), floors at 1, treats `0` files as 1.
- **`heapCapMb`** – divides the budget by concurrent worker count using floor division; single-process case returns the full budget.
- **`workerCount`** – explicit override wins; bounded by both memory and available cores; never returns zero.
- **`the two machines this all exists for`** – end-to-end composition: a 30 GB machine yields 1 shard for 75 integration files; a 2.6 GB machine yields >1 shard for the same layer.

## Relationships

- **`scripts/testing/machine-budget.ts`** – the module under test. All functions and constants (`MAX_SHARD_PEAK_MB`, `MIN_PROCESS_BUDGET_MB`, `PER_FILE_RETENTION_MB`, `PROCESS_BASELINE_MB`) are imported from this single file.

## Notes

- `INTEGRATION_FILES = 75` is a hardcoded snapshot of the current integration test file count; if that layer grows or shrinks, the final describe block's expectations must be revisited.
- Tests that touch `os.totalmem()` / `os.cpus()` are machine-dependent but only assert inequalities, so they pass on any hardware.
- The env-var tests use a deliberately unique variable name to avoid clobbering a real `JEST_WORKERS` setting in the developer's shell.
- `heapCapMb` uses floor division intentionally: workers must never _jointly_ exceed the budget, so rounding up is forbidden.
