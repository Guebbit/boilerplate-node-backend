---
source: scripts/testing/run-suite.ts
sha256: 1edd9757705773d596aee8949070679a71379fbc0ef3e5c7bc597d94d57e877c
generated_at: 2026-09-23T17:32:46.303365+00:00
model: ollama:qwen3.8:27b
---

# scripts/testing/run-suite.ts

## Purpose

Wraps a single test-layer jest invocation in a loop of **sequential** jest processes (shards) so that no single process retains more memory than a weak machine can tolerate. It exists because `--max-old-space-size` only raises the heap ceiling without stopping the per-file retention climb (~70 MB/file measured); exiting a process every *N* files is the actual fix. Invoked via `npx tsx scripts/testing/run-suite.ts <suite-name> [jest-flags…]`.

## Key elements

- **`SUITES`** — `Record<string, Suite>` mapping npm-script names (`unit`, `cross-cutting`, `integration`, `contract`, `fuzz`) to their jest path patterns, serialization flag, and (for parallel layers) a measured `workerPeakMb`.
- **`Suite`** — discriminated union: `serialized: true` layers (shared in-memory mongod) carry no `workerPeakMb`; `serialized: false` layers do.
- **`countTestFiles()`** — runs `npx jest --listTests` synchronously and counts `.test.ts` lines so the file count reflects jest's own resolver (including `testPathIgnorePatterns`).
- **`runShard(shard)`** — spawns one `npx jest` process with the correct `--shard`, `--runInBand`/`--maxWorkers`/`--workerIdleMemoryLimit` flags, and a pinned `NODE_OPTIONS` `--max-old-space-size`. Resolves with the child's exit code (1 for signal death).
- **`main()`** — logs a summary line, then awaits each shard in a `for` loop; exits non-zero on the first failure.
- Computed values (`budgetMb`, `targetMb`, `perShard`, `shards`, `workers`, `heapMb`, `boundingFlags`) — all derived from `machine-budget.ts` helpers plus environment knobs (`JEST_PROCESS_BUDGET_MB`, `JEST_SHARDS`, `JEST_WORKERS`).

## Relationships

- **`scripts/testing/machine-budget.ts`** — sole import source. Provides `availableMemoryMb`, `clampShards`, `environmentKnob`, `filesPerShard`, `heapCapMb`, `processBudgetMb`, `shardCount`, `shardTargetMb`, and `workerCount`. All memory/shard arithmetic lives there; this file only composes their results into jest CLI flags and spawn options.

## Notes

- **Sequential shards are the feature.** The `await` inside the `for` loop in `main()` is deliberate: only one shard's memory is live at a time. Do not "optimise" it to parallel.
- **Serialized layers never parallelise.** `--runInBand` is used because those suites share a single in-memory mongod; `--workerIdleMemoryLimit` would be inert and is therefore omitted.
- **`recycleLimitMb` has a 1024 MB floor.** Without it, a small `workerPeakMb` could set a limit below the worker's steady-state baseline, causing a restart after every file (measured as slower than the retention it was meant to fix).
- **`NODE_OPTIONS` is set per-spawn**, appending `--max-old-space-size` to whatever the parent already has. This overrides Node's default of deriving the ceiling from *total* RAM.
- **Unknown suite name → exit 2** with a message listing valid names. An empty `argv[2]` also hits this path.
- **`passthrough`** (all argv after the suite name) is forwarded verbatim to jest, so `--verbose`, `--testPathPattern=…`, etc. work without modification.
- **`countTestFiles` returns 0 on spawn failure** (e.g., `npx` not found). This yields a single-shard run rather than a crash, but the jest invocation will still fail with a clearer error.
