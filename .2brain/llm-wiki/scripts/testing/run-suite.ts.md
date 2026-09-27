---
source: scripts/testing/run-suite.ts
sha256: 89986d4ee1c86269b61338f969bcaa10cd9725b05c51a5f207a615b269eb8160
generated_at: 2026-09-27T14:00:46.656261+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-suite.ts

## Purpose

CLI entry point that runs a single test layer (unit, integration, contract, etc.) as a series of **sequential** jest processes, bounding how much memory one process may retain on a constrained machine. It exists because jest accumulates ~70 MB of module-registry retention per test file; a single process over the full integration layer would hit Node's heap ceiling long before finishing. Sharding (jest's `--shard`) forces a process to exit every N files, which reclaims that memory.

## Key elements

- **`SUITES`** (exported) — `Record<string, Suite>` mapping layer names (`unit`, `cross-cutting`, `integration`, `contract`, `fuzz`) to their jest path patterns, a `serialized` flag, and (for parallel layers) a `workerPeakMb` measurement. Exported so `package.json` scripts can name layers without duplicating patterns.
- **`splitSuiteNames`** — Splits `process.argv` into leading suite names and trailing jest passthrough flags. The first arg not found in `SUITES` ends the split.
- **`countTestFiles`** — Spawns `npx jest --listTests` to get the authoritative file count (respects `testPathIgnorePatterns`), rather than globbing.
- **`runShard`** — Spawns one jest process (one shard) asynchronously with `stdio: 'inherit'`; resolves with the exit code.
- **Budget/shard math** (main body) — Reads `JEST_PROCESS_BUDGET_MB` / free memory via `machine-budget`, computes `filesPerShard`, shard count, worker count, per-worker heap cap, and `--workerIdleMemoryLimit`. Then loops `runShard` sequentially.
- **`--unsharded` mode** — When present in argv, skips all budget math and runs every named suite's patterns in a single `spawnSync('npx', ['jest', …])` call. Intended for coverage, JSON-report, and randomized-order runs.

## Relationships

- **`scripts/testing/machine-budget.ts`** — All memory/shard arithmetic (`processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `heapCapMb`, `workerCount`, `clampShards`, `environmentKnob`, `availableMemoryMb`) is delegated to this module. This file only orchestrates *how many* shards/workers to spawn, not *how to compute* them.
- Spawns `npx jest` as child processes (both async `spawn` for sharded runs and sync `spawnSync` for unsharded and `--listTests`).
- Consumed by `package.json` npm scripts (`test:integration`, `test:unit`, etc.) that pass a suite name and optionally `--unsharded`.

## Notes

- **Sharded mode accepts exactly one suite.** Passing multiple names without `--unsharded` is an error (exit 2). Use `--unsharded` to combine layers.
- **Serialized layers** (`integration`, `contract`, `fuzz`) share one in-memory `mongod`, so they run `--runInBand` and always get 1 worker. `--workerIdleMemoryLimit` is deliberately omitted for them—jest ignores it in band mode, and a low value would cause needless worker recycling.
- **Parallel layers** get their heap budget *divided* among workers (`heapCapMb(budgetMb, workers)`) to avoid over-committing. Each worker's cap is floored one MB above `recycleLimitMb` so the idle-memory recycle always fires before the heap ceiling.
- **`recycleLimitMb` floor of 1024 MB** prevents a small `workerPeakMb` from setting a limit so low that jest restarts a worker after nearly every file (slower than the retention it prevents).
- **`JEST_SHARDS` env knob** overrides shard count for any layer (including parallel ones), clamped to the actual file count so no shard runs empty.
- The file uses `#!/usr/bin/env tsx` — it must be invoked via tsx, not plain node.
