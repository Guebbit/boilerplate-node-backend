---
source: scripts/testing/machine-budget.ts
sha256: 149a2e173d6a8631acaa7c49e120a971ad6ca46087cdc4997534587021b857c7
generated_at: 2026-09-23T17:32:03.606532+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/machine-budget.ts

## Purpose

Single source of truth for how hard test runners may push the current machine. It translates available RAM and declared per-unit costs into concrete worker counts, per-process heap caps, and shard counts—always yielding to an explicit environment variable set by the operator.

## Key elements

- **`availableMemoryMb()`** — Returns free memory in MB by reading `/proc/meminfo` (`MemAvailable`), falling back to `os.freemem()`. Clamped between 1 and total memory.
- **`environmentKnob(name)`** — Reads a sizing variable from `process.env` first, then the local `.env` file (parsed in isolation, never merged into the environment). Returns a positive integer or `undefined`.
- **`positiveInteger(value)`** — Validates a trimmed string as a positive integer; returns `undefined` otherwise.
- **`OS_RESERVE_MB`** (2048) — Memory left unclaimed for the OS, container services, and an editor. Subtracted before any sizing.
- **`PROCESS_BASELINE_MB`** (1100) — Measured cost of one jest process plus its in-process `mongod` before running any test file.
- **`PER_FILE_RETENTION_MB`** (70) — Measured per-file retention in a non-recycling jest process; the constant that makes sharding necessary.
- **`processBudgetMb(override?)`** — Per-process spending limit in MB (available memory minus OS reserve), floored at `MIN_PROCESS_BUDGET_MB`. Explicit override wins.
- **`MIN_PROCESS_BUDGET_MB`** — `PROCESS_BASELINE_MB + PER_FILE_RETENTION_MB`; below this a process cannot hold the runner plus one file.
- **`MAX_SHARD_PEAK_MB`** (8192) — Guard-rail ceiling on shard size so an idle machine doesn't produce one unbounded shard.
- **`shardTargetMb(budgetMb)`** — Budget clamped between `MIN_PROCESS_BUDGET_MB` and `MAX_SHARD_PEAK_MB`.
- **`filesPerShard(targetMb)`** — Derives the max test files one shard may execute from the target.
- **`shardCount(fileCount, perShard)`** — Number of sequential shards a layer needs (≥ 1, ≤ fileCount).
- **`clampShards(override, fileCount)`** — Validates an explicit `JEST_SHARDS` so it never exceeds the file count (avoids empty shards that exit non-zero).
- **`workerCount({peakMb, cpuReserve, override?})`** — Parallel worker count bounded by both core count and available RAM (the RAM bound catches what jest's CPU-only default misses).
- **`heapCapMb(budgetMb, workers?)`** — V8 `--max-old-space-size` per spawned process; divides the budget across concurrently-running workers.

## Relationships

- **`scripts/testing/run-suite.ts`** — Primary consumer; calls `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, `workerCount`, and `heapCapMb` to configure jest invocations (shard flags, `--maxWorkers`, `--max-old-space-size`).
- **`scripts/mutation/stryker-run.ts`** — Consumes `workerCount` and `heapCapMb` to size the mutation-testing pool so it fits within the same memory budget.
- **`tests/support/knobs.ts`** — Test-support module that reads the same environment knobs (`environmentKnob`-style lookups) to adjust per-test concurrency and rate-limit overrides at runtime.
- **`tests/unit/scripts/testing/machine-budget.test.ts`** — Unit tests covering the arithmetic and edge cases of every exported function in this module.

## Notes

- Reads `.env` with `node:util`'s `parseEnv` rather than `process.loadEnvFile()` specifically to avoid polluting `process.env`—the resulting environment is handed to every spawned jest, and merging app-level rate limits before `tests/support/setup.ts` can raise them causes spurious 429s.
- `/proc/meminfo` is read in a try/catch (not an existence check) because the absence of `/proc` on macOS/Windows is the normal path, not an error.
- All sizing constants (`PROCESS_BASELINE_MB`, `PER_FILE_RETENTION_MB`) are single-measurement values from 2026-09-15, documented with the exact shard/run that produced them; they are not recalculated at runtime.
- `MAX_SHARD_PEAK_MB` is a *guard rail*, not a target: a memory-constrained machine should set `JEST_PROCESS_BUDGET_MB` explicitly below it rather than relying on the ceiling. See `docs/tools/weak-machines.md`.
