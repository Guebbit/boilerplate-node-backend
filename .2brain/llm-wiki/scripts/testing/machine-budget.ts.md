---
source: scripts/testing/machine-budget.ts
sha256: c4153166048071954fd4425aa925d0b1a11d462a01e8a1cc618eaea3ae2b43e2
generated_at: 2026-11-08T03:02:41.647303+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/machine-budget.ts

## Purpose

Single source of truth for how much memory and CPU the test runners may consume on the current machine. It derives worker counts, per-process heap caps, and jest shard counts from `MemAvailable` (not `os.freemem()`) and a set of measured per-file retention constants, so that test execution is sized to what is actually free right now rather than what the machine nominally has. Every value it produces can be overridden by an explicit environment variable.

## Key elements

- **`availableMemoryMb()`** — returns `process.availableMemory()` (i.e. `MemAvailable` / cgroup-aware) clamped to `[1, os.totalmem()]` in MB.
- **`readEnvironmentFile()`** (internal) — parses `.env` via `node:util` `parseEnv` *without* merging into `process.env`, so spawned jest processes don't inherit app rate limits before `tests/support/setup-environment.ts` can raise them.
- **`environmentKnob(name)`** — resolves a sizing variable from `process.env` first, then `.env`; returns a positive integer or `undefined`.
- **`positiveInteger(value)`** — validates a string as a positive integer.
- **`PROCESS_BASELINE_MB`** (1100) — measured RSS cost of a jest process before any test file runs (runner + in-process `mongod`).
- **`PER_FILE_RETENTION_MB`** (70) — measured per-file heap retention in a non-recycled jest process; the constant that makes sharding necessary.
- **`OS_RESERVE_MB`** (2048) — headroom subtracted before sizing for the OS, container stack, and editor.
- **`MIN_PROCESS_BUDGET_MB`** — `PROCESS_BASELINE_MB + PER_FILE_RETENTION_MB`; below this a process cannot hold the runner plus one file.
- **`MAX_SHARD_PEAK_MB`** (8192) — guard-rail ceiling so an idle machine doesn't size one unbounded shard; high enough that a normal layer runs un-sharded.
- **`processBudgetMb(override?)`** — `availableMemoryMb() - OS_RESERVE_MB`, floored at `MIN_PROCESS_BUDGET_MB`, or the override.
- **`shardTargetMb(budgetMb)`** — clamps the budget to `[MIN_PROCESS_BUDGET_MB, MAX_SHARD_PEAK_MB]`.
- **`filesPerShard(targetMb)`** — how many test files fit in one shard process.
- **`shardCount(fileCount, perShard)`** — number of sequential shards needed.
- **`clampShards(override, fileCount)`** — clamps an explicit `JEST_SHARDS` value to `[1, fileCount]` to avoid empty shards.
- **`workerCount({peakMb, cpuReserve, override?})`** — parallel worker count bounded by both cores and available memory.
- **`heapCapMb(budgetMb, workers?)`** — `--max-old-space-size` value for one spawned process; divides the budget by concurrent worker count.

## Relationships

- **`scripts/testing/run-suite.ts`** — primary consumer; calls `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, `heapCapMb`, and `workerCount` to configure each jest invocation.
- **`scripts/mutation/stryker-run.ts`** — consumes `workerCount` and `heapCapMb` to size Stryker mutation-testing workers.
- **`docker-compose.test.yml`** — defines the container stack (Mongo, Redis, RabbitMQ) that `OS_RESERVE_MB` reserves headroom for; the sizing logic assumes those services are already consuming memory.
- **`tests/support/knobs.ts`** — test-support layer that reads the same environment-variable knobs (`JEST_WORKERS`, `JEST_SHARDS`, `JEST_PROCESS_BUDGET_MB`) that this module resolves, ensuring the test runtime and the sizing logic agree on values.
- **`tests/unit/scripts/testing/machine-budget.test.ts`** — unit tests exercising the pure functions (`positiveInteger`, `shardCount`, `clampShards`, `filesPerShard`, `heapCapMb`, `workerCount`) with mocked memory/OS values.

## Notes

- This is a **module** (`@module` directive, no default export). All exports are named.
- `.env` is read **once** at import time into `environmentFileValues`; repeated calls to `environmentKnob` do not re-read the file.
- The `parseEnv` choice (vs. `process.loadEnvFile()`) is deliberate: merging `.env` into `process.env` would let the app's real rate-limit values propagate into spawned jest processes before `tests/support/setup-environment.ts` can raise them, causing self-inflicted 429s in concurrency suites.
- `MAX_SHARD_PEAK_MB` is a guard rail, not a target. On a memory-constrained machine the operator is expected to set `JEST_PROCESS_BUDGET_MB` explicitly below it (see `docs/tools/weak-machines.md`).
- `heapCapMb` divides by worker count because parallel workers run simultaneously; a serialized (in-band) layer passes `workers = 1` and gets the full budget.
- All measured constants carry a date (2026-09-15) in their doc comments; they are empirical, not derived.
