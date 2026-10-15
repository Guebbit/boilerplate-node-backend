---
source: scripts/testing/run-suite.ts
sha256: 30dd55dfa00556a0811c26ab1cb58b3ed5c29f695d9bfc052c43540facd19106
generated_at: 2026-10-15T09:48:57.697631+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-suite.ts

## Purpose

Wraps `jest` with a memory-budget layer for machines that cannot hold an entire test layer's accumulated per-file allocations in one process. Instead of raising Node's heap ceiling (which only delays the OOM), it splits a serialized layer's files into a small number of sequential jest processes (`--shard`), each capped at a computed `--max-old-space-size`. It also exposes a `--unsharded` escape hatch for callers (coverage, JSON report, randomized order) that deliberately want every pattern in a single process.

## Key elements

- **`SUITES`** (exported) — `Record<string, Suite>` mapping layer names (`unit`, `cross-cutting`, `integration`, `contract`, `fuzz`) to their jest path patterns and whether files must run in-band (`serialized: true`). The single source of truth for patterns; `package.json` scripts reference suite names rather than duplicating patterns.
- **`splitSuiteNames`** — Splits argv into leading known suite names and trailing jest passthrough flags. The first arg that is not a key in `SUITES` ends the name list.
- **`countTestFiles`** — Calls `jest --listTests` (sync) and counts `.test.ts` lines so the shard math uses the same resolver (including `testPathIgnorePatterns`) that will actually run the files.
- **`runShard`** — Spawns one jest process for a given shard index via `node:child_process.spawn`; resolves with the child's exit code (1 for signal death).
- **Budget pipeline** — `processBudgetMb` → `shardTargetMb` → `filesPerShard` → `shardCount` computes how many sequential processes to launch; `workerCount` and `heapCapMb` size parallel workers. All pulled from `machine-budget`.
- **`--unsharded` mode** — Flattens all named suites' patterns into a single `spawnSync('npx jest …')` call, skipping the shard/heap math entirely.

## Relationships

- **`scripts/testing/machine-budget.ts`** — Provides every numeric budget helper this file calls: `environmentKnob`, `processBudgetMb`, `shardTargetMb`, `filesPerShard`, `shardCount`, `clampShards`, `workerCount`, `heapCapMb`, `availableMemoryMb`. This file is the sole consumer that turns those numbers into jest CLI flags.
- **`scripts/modules-on-disk.ts`** — Supplies `REPO_ROOT`, used as `cwd` for every `spawnSync`/`spawn` call so jest resolves from the repository root regardless of the caller's working directory.

## Notes

- `serialized` is a property of the *layer*, not the machine: integration, contract, and fuzz suites share one in-memory `mongod`, so their files cannot run in parallel regardless of free RAM.
- `--workerIdleMemoryLimit` is intentionally omitted for serialized suites (one in-band worker makes the flag inert) and floored at 1024 MB for parallel suites to prevent recycling after every single file.
- Sharded mode accepts exactly **one** suite name; combining multiple suites requires `--unsharded`.
- `JEST_SHARDS` can force a shard count on a parallel layer, but is clamped to the actual file count (a shard beyond that would run empty and jest exits non-zero).
- The `--unsharded` path uses `spawnSync` (blocking) while the sharded path uses `spawn` (async) — the latter enables sequential-but-non-blocking shard chaining.
