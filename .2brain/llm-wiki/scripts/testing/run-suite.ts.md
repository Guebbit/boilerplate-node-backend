---
source: scripts/testing/run-suite.ts
sha256: e2f5bb267b321169f94b990b59d98a35ccb9a69de2309bb334e5397b4a78e202
generated_at: 2026-10-01T12:41:39.460762+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-suite.ts

## Purpose

A CLI wrapper around `npx jest` that runs a single test layer as a series of **sequential** jest processes (shards) to bound per-process memory retention on memory-constrained machines. It exists because jest's per-file module-registry retention (~70 MB/file) would exhaust a single process's heap on large suites, and `--max-old-space-size` only raises the ceiling without stopping the climb.

## Key elements

- **`SUITES`** (exported) — `Record<string, Suite>` mapping suite names (`unit`, `cross-cutting`, `integration`, `contract`, `fuzz`) to their jest path patterns, a `serialized` flag, and (for parallel layers) a measured `workerPeakMb`. Single source of truth for patterns so `package.json` scripts don't hand-copy them.
- **`splitSuiteNames`** — Splits argv into leading known suite names and trailing passthrough jest flags. A suite name is never flag-shaped; the first non-`SUITES`-key argument ends the split.
- **`countTestFiles`** — Runs `npx jest … --listTests` synchronously and counts lines ending in `.test.ts`. Uses jest's resolver (not a glob) so `testPathIgnorePatterns` is respected.
- **`runShard`** — Spawns one `npx jest` process for a 1-based shard number, passing `--shard=i/N` when sharded. Returns the child's exit code.
- **`--unsharded` mode** — When this flag is present, all named suites' patterns are merged into a **single** jest invocation (`spawnSync`, stdio inherit), skipping all shard/heap math. Intended for coverage, JSON reports, and randomized-order runs.
- **Budget chain** — `processBudgetMb` → `shardTargetMb` → `filesPerShard` → `shardCount` → `workerCount` / `heapCapMb`, all sourced from `machine-budget`.

## Relationships

- **`scripts/testing/machine-budget.ts`** — Sole dependency. Provides every memory/shard/worker calculation this file consumes (`availableMemoryMb`, `clampShards`, `environmentKnob`, `filesPerShard`, `heapCapMb`, `processBudgetMb`, `shardCount`, `shardTargetMb`, `workerCount`). This file contains no arithmetic of its own beyond a `Math.max` floor.

## Notes

- **Sharded mode accepts exactly one suite.** Passing more than one name without `--unsharded` is a hard error (exit 2).
- **Serialized vs. parallel:** Serialized suites (`integration`, `contract`, `fuzz`) run `--runInBand` inside each shard and get the full shard target as their heap. Parallel suites (`unit`, `cross-cutting`) get `--maxWorkers` and `--workerIdleMemoryLimit`; their heap is the budget divided by worker count, floored one MB above the recycle limit so the recycle fires first.
- **`--workerIdleMemoryLimit` is intentionally absent for serialized layers** (no worker to recycle in band) and floored at 1024 MB for parallel layers to prevent per-file recycling.
- **`JEST_SHARDS`** env var overrides the computed shard count even for parallel layers, clamped to the actual file count (an empty shard makes jest exit non-zero).
- **`JEST_PROCESS_BUDGET_MB`** and **`JEST_WORKERS`** are the operator-facing environment knobs, read via `environmentKnob`.
- The file is executed directly via the `tsx` shebang, not imported as a module.
