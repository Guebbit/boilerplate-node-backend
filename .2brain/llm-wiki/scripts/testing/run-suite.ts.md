---
source: scripts/testing/run-suite.ts
sha256: 65fc7d6106fc4863389944721e59a376725cf5540ea471d3d735f9c592366a9e
generated_at: 2026-11-08T03:03:38.964034+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-suite.ts

## Purpose

CLI entry point that runs a named test layer as a series of **sequential** jest processes, bounding per-process memory on machines with limited RAM. It exists because a single jest process retains ~70 MB per test file in its heap, and `--max-old-space-size` only raises the ceiling without stopping the climb. Sharding (a process that exits every N files) is the fix, and this script owns the shard-count math, worker-count math, and heap-cap assignment.

## Key elements

- **`splitSuiteNames(args)`** — splits CLI arguments into leading suite names (keys of `SUITES`) and trailing jest passthrough flags.
- **`workerFlags(workers, recycleLimitMb)`** — returns `['--runInBand']` for a single worker, or `--maxWorkers` + `--workerIdleMemoryLimit` otherwise.
- **`recycleLimitFor(workerPeakMb)`** — floors the worker recycle limit at 1024 MB to prevent jest from recycling after nearly every file.
- **`countTestFiles()`** — spawns `npx jest --listTests` with the suite's patterns and counts matching `.test.ts` lines; returns 0 on spawn error.
- **`--unsharded` mode** (guarded by `process.argv.includes('--unsharded')`) — skips all shard/heap math and runs every named suite's patterns in a single `spawnSync('npx jest …')`, passing caller-supplied worker flags through if present.
- **Sharded-mode main flow** (after the `--unsharded` branch) — resolves budget → target → files-per-shard → shard count, then iterates shards spawning jest with `--max-old-space-size`, `--runInBand` or `--maxWorkers`, and the suite's patterns.
- **Heap-cap logic** — in-band layers get the full shard target; parallel layers split the unclamped budget across `workers` and floor at `recycleLimitMb + 1`.

## Relationships

- **`scripts/testing/machine-budget.ts`** — source of all memory/shard calculations: `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `workerCount`, `heapCapMb`, `clampShards`, `environmentKnob`. This file consumes those values; it does not compute raw memory itself.
- **`scripts/testing/suites.ts`** — provides the `SUITES` registry (suite name → `{ patterns, workerPeakMb, serialized }`). This script reads patterns, peak cost, and the serialized flag from it; `SUITES` is the single source of truth for which test files belong to each layer.
- **`scripts/modules-on-disk.ts`** — supplies `REPO_ROOT`, the working directory for every `spawnSync`/`spawn` call so jest resolves configs relative to the repo root regardless of the caller's cwd.

## Notes

- **Sharded mode accepts exactly one suite name.** Multiple names require `--unsharded`. A usage error (exit 2) is raised otherwise.
- **Only in-band layers are sharded.** Parallel layers rely on `--workerIdleMemoryLimit` to recycle workers; sharding them would pay a redundant `mongod` boot per shard for a problem recycling already solves.
- **`JEST_SHARDS`** overrides the computed shard count but is clamped to the actual file count—shards beyond the file count make jest exit non-zero.
- **`JEST_WORKERS`** and **`JEST_PROCESS_BUDGET_MB`** are the operator-facing environment knobs; `environmentKnob` reads and parses them.
- The 1024 MB floor in `recycleLimitFor` is load-bearing: without it, a small `workerPeakMb` sets a limit so low jest recycles a worker after nearly every file, which is measurably slower than the retention it prevents.
- For parallel layers, each worker's `--max-old-space-size` is `budgetMb / workers` (via `heapCapMb`), not the full target—handing every worker the full target would let them jointly claim more than the machine has.
