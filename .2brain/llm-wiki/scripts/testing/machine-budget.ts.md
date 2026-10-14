---
source: scripts/testing/machine-budget.ts
sha256: e49ceb4c375a18b85e51b37fc3ec9405f51ae10f30e770bfa9ff602a20256cad
generated_at: 2026-10-14T07:32:42.675359+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/machine-budget.ts

## Purpose

Single decision point for how hard the test runners may push the local machine. Computes worker counts, per-process heap caps, and shard counts from *available* memory (not total RAM), so that suites scale down gracefully on constrained hardware. An explicit environment variable always overrides every heuristic in this file.

## Key elements

- **`availableMemoryMb()`** — Reads `MemAvailable` from `/proc/meminfo` (Linux) with `os.freemem()` as fallback; clamped to `[1, totalmem]`.
- **`readEnvironmentFile()`** *(private)* — Parses `.env` with `parseEnv` without merging into `process.env`; cached once at module load.
- **`environmentKnob(name)`** — Resolves a positive-integer env var, preferring the live process environment over the `.env` file.
- **`positiveInteger(value)`** — Parses a string to a positive int or returns `undefined`.
- **`OS_RESERVE_MB`** (2048) — Headroom left for OS, containers (Mongo/Redis/RabbitMQ), and an editor.
- **`PROCESS_BASELINE_MB`** (1100) — Measured cost of one jest process + in-process `mongod` before any test file runs.
- **`PER_FILE_RETENTION_MB`** (70) — Measured per-file heap retention in a non-recycled jest process; the constant that makes sharding necessary.
- **`processBudgetMb(override?)`** — Per-process spending limit: `availableMemoryMb() - OS_RESERVE_MB`, floored at `MIN_PROCESS_BUDGET_MB`.
- **`MIN_PROCESS_BUDGET_MB`** — `PROCESS_BASELINE_MB + PER_FILE_RETENTION_MB`; below this a run cannot pass.
- **`MAX_SHARD_PEAK_MB`** (8192) — Guard-rail ceiling so an idle machine doesn't size one unbounded shard.
- **`shardTargetMb(budgetMb)`** — Clamps the budget into `[MIN_PROCESS_BUDGET_MB, MAX_SHARD_PEAK_MB]`.
- **`filesPerShard(targetMb)`** — How many test files one process may execute before handing to the next shard.
- **`shardCount(fileCount, perShard)`** — Sequential shard count for a layer (≥ 1, ≤ fileCount).
- **`clampShards(override, fileCount)`** — Sanitises an explicit `JEST_SHARDS` value so an empty shard never fails the run.
- **`workerCount({peakMb, cpuReserve, override})`** — Parallel worker count bounded by both CPU cores and available RAM.
- **`heapCapMb(budgetMb, workers)`** — `--max-old-space-size` value for one spawned process; divides the budget by concurrent worker count.

## Relationships

- **`scripts/testing/run-suite.ts`** — Primary consumer; calls `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, `workerCount`, and `heapCapMb` to configure jest invocations per layer.
- **`scripts/mutation/stryker-run.ts`** — Consumes `workerCount` and `heapCapMb` to size Stryker mutation-test workers the same way.
- **`tests/support/knobs.ts`** — Provides the per-worker `peakMb` and `cpuReserve` inputs that `workerCount` requires.
- **`tests/unit/scripts/testing/machine-budget.test.ts`** — Unit-tests the sizing functions against fixed memory/CPU inputs.

## Notes

- Reads `MemAvailable` (kernel's estimate of reclaimable + free), **not** `os.freemem()` (which maps to `MemFree`, excluding page cache) and **not** `os.totalmem()`. The `/proc` read is a deliberate try/catch for cross-platform support.
- `.env` is parsed with `parseEnv`, **never** `process.loadEnvFile()`, so values do not leak into the environment inherited by spawned jest processes.
- `environmentFileValues` is read **once** at module load; all knob lookups reference that cached object.
- `MAX_SHARD_PEAK_MB` is a guard rail, not a target: on a machine with ≥ 8 GB free it is never binding, and sharding is skipped entirely (single shard runs the whole layer).
- `PER_FILE_RETENTION_MB` and `PROCESS_BASELINE_MB` were measured 2026-09-15 on the 19-file integration shard; update them if the suite composition changes materially.
- `heapCapMb` divides the budget by `workers` because parallel workers run concurrently and must jointly fit within the same machine budget that `workerCount` already used to determine the count.
