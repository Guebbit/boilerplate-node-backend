---
source: scripts/testing/machine-budget.ts
sha256: 21dfa0adb5f17271c55bd33b322b310b5677147a4054e088a870f68e663b0ff6
generated_at: 2026-10-29T01:45:13.292029+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/machine-budget.ts

## Purpose

The single decision point for how much memory, parallelism, and sharding the test runners may use **on this machine, right now**. It translates available RAM and CPU into concrete jest/shard/worker numbers, replacing the old "size for total system RAM" heuristic that broke on memory-constrained boxes. Every other test script asks this module rather than computing its own numbers.

## Key elements

- **`availableMemoryMb()`** – Returns free memory in MB via `/proc/meminfo` `MemAvailable` (preferred) or `os.freemem()` (fallback). Clamped to `[1, totalmem]`.
- **`environmentKnob(name)`** – Reads a sizing knob from `process.env` first, then the `.env` file. Returns a positive integer or `undefined`.
- **`positiveInteger(value)`** – Validates a string as a positive integer; returns `undefined` on any failure.
- **`PROCESS_BASELINE_MB`** (1100) – Measured cost of one jest process + in-process `mongod` before any test file runs.
- **`PER_FILE_RETENTION_MB`** (70) – Measured per-file RSS retention in a non-recycled jest process. The constant that makes sharding necessary.
- **`processBudgetMb(override?)`** – Per-process spending limit: `availableMemory − OS_RESERVE`, floored at `MIN_PROCESS_BUDGET_MB`. An explicit override wins outright.
- **`MIN_PROCESS_BUDGET_MB`** – Floor = `PROCESS_BASELINE_MB + PER_FILE_RETENTION_MB`; below this a process can't even run one file.
- **`MAX_SHARD_PEAK_MB`** (8192) – Guard-rail ceiling so an idle machine doesn't produce one unbounded shard. Set high enough that an 8 GB box runs any layer in a single shard with no `--shard` flag.
- **`shardTargetMb(budgetMb)`** – Caps the budget at `MAX_SHARD_PEAK_MB`, floors at `MIN_PROCESS_BUDGET_MB`.
- **`filesPerShard(targetMb)`** – How many test files one jest process may execute before the next shard takes over.
- **`shardCount(fileCount, perShard)`** – Number of sequential jest processes a layer needs (≥ 1, ≤ file count).
- **`clampShards(override, fileCount)`** – Validates a `JEST_SHARDS` override so an empty shard (and its non-zero exit) is never produced.
- **`workerCount({ peakMb, cpuReserve, override })`** – Parallel worker count bounded by **both** available cores and RAM. An explicit override wins.
- **`heapCapMb(budgetMb, workers = 1)`** – V8 `--max-old-space-size` for one spawned process; divides the budget by the number of concurrently-running processes.

## Relationships

- **`scripts/testing/run-suite.ts`** – Primary consumer. Calls `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, and `heapCapMb` to configure jest invocations (shard size, `--max-old-space-size`, worker count).
- **`scripts/mutation/stryker-run.ts`** – Uses `workerCount` and `heapCapMb` to size the stryker mutation-testing pool.
- **`tests/support/knobs.ts`** – Defines the knob names / defaults that `environmentKnob` resolves; the two files agree on which variables control sizing.
- **`tests/unit/scripts/testing/machine-budget.test.ts`** – Unit-tests the pure math functions (`positiveInteger`, `filesPerShard`, `shardCount`, `clampShards`, `heapCapMb`, `workerCount`) with mocked `os` and `availableMemoryMb`.

## Notes

- **`.env` is read without merging.** The module uses `util.parseEnv` (not `process.loadEnvFile`) specifically so the app's production rate-limit values never leak into child jest processes before `tests/support/setup-environment.ts` can raise them.
- **`.env` is read once at module load** (`environmentFileValues`), so cost is O(1) regardless of how many knobs are queried.
- **Resolution order:** real environment variable → `.env` file → `undefined` (fall through to heuristic). An operator's explicit number is treated as a fact; no heuristic overrides it.
- **`OS_RESERVE_MB` (2048)** is subtracted before any sizing so the OS, container stack (Mongo/Redis/RabbitMQ), and editor retain headroom.
- **`MAX_SHARD_PEAK_MB` is a guard rail, not a target.** On a memory-constrained machine you set `JEST_PROCESS_BUDGET_MB` explicitly (see `docs/tools/weak-machines.md`) rather than relying on this ceiling.
- **The per-file constants are measured, not derived.** `PROCESS_BASELINE_MB` and `PER_FILE_RETENTION_MB` were captured from a real run on 2026-09-15; they should be re-measured if the test surface or jest version changes materially.
