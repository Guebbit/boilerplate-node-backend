---
source: scripts/testing/machine-budget.ts
source_sha256: 5dc7d86b628533a6ddf129a8353cc9480cb003814b361c57f8744d972673eda3
context_sha256: ce3ef1d35334de26f645bb41aac90abe08de9ad6f7b9eec38c23cf736e79ccb5
generated_at: 2026-11-22T02:18:49.128877+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/machine-budget.ts

## Purpose
Single source of truth for how hard the test runners may push the current machine. It reads available memory (`process.availableMemory()`, not `os.totalmem()`) plus the caller's declared per-unit cost, and decides worker counts, per-process heap caps and shard counts. An explicitly set environment variable always beats any heuristic here.

## Key elements
- `availableMemoryMb()` — memory a new workload can claim, in MB; uses `process.availableMemory()`, clamped to `[1, total RAM]`.
- `environmentKnob(name)` — reads a sizing knob from `process.env` first, then from `.env`; returns a positive integer or `undefined`.
- `positiveInteger(value)` — parses a trimmed string to a positive integer, else `undefined`.
- `PROCESS_BASELINE_MB` (1100) — cost of a jest process before any test file runs (runner plus the in-process `mongod`).
- `PER_FILE_RETENTION_MB` (70) — memory each executed test file leaves behind in a non-recycled jest process; this is why sharding is needed.
- `MIN_PROCESS_BUDGET_MB` — floor for the budget (baseline + one file's retention).
- `MAX_SHARD_PEAK_MB` (8192) — guard rail capping a single shard's size.
- `processBudgetMb(override?)` — per-process budget: the override, or available memory minus a 2048 MB OS reserve, floored at the minimum.
- `shardTargetMb(budgetMb)` — budget clamped between the minimum and `MAX_SHARD_PEAK_MB`.
- `filesPerShard(targetMb)` — files one jest process may run before handing over to the next shard (at least 1).
- `shardCount(fileCount, perShard)` — sequential shards needed; between 1 and `fileCount`.
- `clampShards(override, fileCount)` — clamps an explicit `JEST_SHARDS` value to `[1, fileCount]` so no shard is empty.
- `workerCount({ peakMb, cpuReserve, override })` — worker count bounded by both CPU (cores minus reserve) and RAM; at least 1.
- `heapCapMb(budgetMb, workers = 1)` — value for `--max-old-space-size`; divides the budget across concurrently running processes.

## Relationships
- Listed neighbors `scripts/testing/run-suite.ts` and `scripts/mutation/stryker-run.ts` are the likely consumers. The file's own text only says it sizes "the test runners", so the exact call sites are not visible here.
- `tests/support/knobs.ts` is a neighbor, but this file does not import it.
- `tests/unit/scripts/testing/machine-budget.test.ts` is the unit test for this module.

## Notes
- `.env` is read once at module load with `parseEnv`, not `process.loadEnvFile()`. This keeps it out of `process.env`, which is passed to every spawned jest. Merging it would apply the app's real rate limits before the test setup can raise them, and concurrency suites would get 429s.
- Only the sizing knobs are taken from the parsed `.env`. A missing `.env` is normal (CI) and gives `{}`.
- The real environment beats `.env`, so one-offs like `JEST_WORKERS=1 npm run test:integration` work.
- `MAX_SHARD_PEAK_MB` is a guard rail, not a target. On a machine with enough headroom (about 8 GB), a layer runs in one shard and `--shard` is not needed. Memory-constrained machines are expected to set `JEST_PROCESS_BUDGET_MB` explicitly.
- `heapCapMb` takes `shardTargetMb`'s result for serialized layers. For parallel layers it takes the unclamped `processBudgetMb`, divided by the worker count.
- The 1100 MB and 70 MB constants were measured on 2026-09-15 (a 19-file shard peaked at 2407 MB RSS). Re-measure if the test setup changes.
