---
source: scripts/testing/run-suite.ts
sha256: 2fed22a81ffbf5287bee2138ac28774d4f682625340a9c98012bfa146deae8b8
generated_at: 2026-10-14T07:34:01.522684+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-suite.ts

## Purpose

CLI wrapper around `jest` that runs a single test layer as a series of **sequential** jest processes (shards) to cap peak memory on machines with limited RAM. A bare `jest` process retains ~70 MB per test file in its heap; sharding forces a process exit every N files so that retention is released. The file also provides an `--unsharded` mode for callers (coverage, JSON report, randomized-order runs) that need every pattern in one process and already choose their own flags.

## Key elements

- **`SUITES`** (exported) — `Record<string, Suite>` mapping layer names (`unit`, `cross-cutting`, `integration`, `contract`, `fuzz`) to their jest path patterns, a `serialized` discriminant, and (for non-serialized) a `workerPeakMb` figure. Serves as the single source of truth for patterns so `package.json` scripts don't re-list them.
- **`splitSuiteNames`** — splits argv (after stripping `--unsharded`) into leading known suite names and trailing jest passthrough flags.
- **`countTestFiles`** — runs `npx jest --listTests` to get the file count from jest's own resolver (respects `testPathIgnorePatterns`); returns 0 if the spawn fails.
- **`runShard`** — spawns one jest process for a given 1-based shard number, resolves with its exit code.
- **Budget / shard / worker computation** (inline, not exported) — derives `targetMb`, `perShard`, `shards`, `workers`, `heapMb`, and `boundingFlags` from environment knobs (`JEST_PROCESS_BUDGET_MB`, `JEST_SHARDS`, `JEST_WORKERS`) and the machine's free memory, delegating the math to `machine-budget`.
- **`boundingFlags`** — `['--runInBand']` for serialized layers; `['--maxWorkers=N', '--workerIdleMemoryLimit=…MB']` for parallel layers.
- **`--unsharded` path** — `spawnSync('npx', ['jest', …patterns, …passthrough])` in a single process, inheriting stdio, then `process.exit` with jest's status.

## Relationships

- **`scripts/testing/machine-budget.ts`** — provides every piece of the memory-budget calculation this file uses: `availableMemoryMb`, `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, `workerCount`, `heapCapMb`, and `environmentKnob`. This file is the sole consumer that turns those numbers into jest CLI invocations.

## Notes

- **Serialized vs. parallel is a layer property, not a machine property.** Serialized suites share one in-memory `mongod`, so they always run `--runInBand` inside each shard regardless of free RAM.
- **Sharded mode accepts exactly one suite name.** Passing more than one without `--unsharded` exits 2.
- **`JEST_SHARDS` override is clamped to the actual file count** (`clampShards`) to avoid jest exiting non-zero on an empty shard.
- **`recycleLimitMb` has a 1024 MB floor.** Without it, a small `workerPeakMb` would set `--workerIdleMemoryLimit` so low that jest restarts a worker after nearly every file — slower than the retention it prevents.
- **Heap for parallel layers is divided across workers** (`heapCapMb(budgetMb, workers)`); the per-worker cap is floored one MB above `recycleLimitMb` so the recycle always fires before the heap ceiling.
- **`countTestFiles` returning 0** on a spawn error is a documented sentinel (jest couldn't answer), not a genuine zero-file count; downstream `clampShards` will then clamp shards to 1.
- The shebang is `#!/usr/bin/env tsx`; the script is meant to be invoked directly or via an `npm run` alias, not imported.
