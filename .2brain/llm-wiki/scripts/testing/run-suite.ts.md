---
source: scripts/testing/run-suite.ts
source_sha256: 3b2a9e82dd122f21d5a3673a619b6b0fb38039b6c774d7e513adfa01d60a065a
context_sha256: bde8322eb0e6066543a888f80094ba6a64b42d5e56dafe88157b3cea354183c1
generated_at: 2026-11-22T02:20:02.255139+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/testing/run-suite.ts

## Purpose
A CLI wrapper (`tsx`) that runs one test layer (e.g. `npm run test:integration`) as sequential jest processes, so a large layer doesn't exhaust memory on a weak machine. Jest keeps roughly 70 MB per test file in the process, so a long run hits Node's heap ceiling. This script limits that by splitting the layer into shards, bounding workers, and setting heap caps.

## Key elements
- **`unsharded`, `argumentsWithoutFlag`**: detect and strip the `--unsharded` flag from `process.argv`.
- **`splitSuiteNames`**: splits args into leading known suite names (keys of `SUITES`) and jest passthrough args. The first non-suite argument ends the suite names.
- **`workerFlags(workers, recycleLimitMb)`**: returns `--runInBand` for 1 worker. Otherwise it returns `--maxWorkers=N` and `--workerIdleMemoryLimit=…MB`.
- **`recycleLimitFor(peak)`**: the worker recycle limit, floored at 1024 MB so jest doesn't recycle workers after nearly every file.
- **Unsharded branch**: runs all named suites' patterns in one `spawnSync('npx', ['jest', …])` and exits with its status.
  - It still bounds workers using `workerCount`, unless the caller passed `--runInBand` or `--maxWorkers`.
  - It sizes workers from the largest `workerPeakMb` among non-serialized suites. If every suite is serialized, it runs with one worker (in band).
- **`countTestFiles`**: runs `jest --listTests` with the suite's patterns and counts the listed test file paths. Jest does the resolving, so `testPathIgnorePatterns` is honored. It returns 0 if the spawn failed.
- **Budget values**: `budgetMb` → `targetMb` → `perShard`, derived from `JEST_PROCESS_BUDGET_MB` or free memory.
- **`workers`, `inBand`**: serialized suites, or suites narrowed to one worker by `JEST_WORKERS=1`, run in band.
- **`shards`**: only in-band layers are sharded, via `shardCount(fileCount, perShard)`. A `JEST_SHARDS` override applies to any layer and is clamped to the file count by `clampShards`. Parallel layers default to 1 shard.
- **`heapMb`**: the `--max-old-space-size` for each spawned process.
  - In band, it gets the whole shard target.
  - Parallel, it gets a per-worker share of the unclamped budget, floored at `recycleLimitMb + 1` so recycling fires before the heap ceiling.
- **`boundingFlags`**: the per-shard flags, either `--runInBand` or `workerFlags(...)`.
- **`runShard(shard)`**: spawns one jest shard asynchronously with inherited stdio and `--shard=i/N` when there is more than one shard. It resolves to the exit code, with 1 standing in for a signal death. The visible content cuts off partway through this function.

## Relationships
- **`./suites`**: provides `SUITES`, a map of suite name to `patterns`, `serialized` and `workerPeakMb`. This file uses it to validate suite names, get the test globs and decide parallelism.
- **`./machine-budget`**: provides the sizing helpers (`availableMemoryMb`, `clampShards`, `environmentKnob`, `filesPerShard`, `heapCapMb`, `processBudgetMb`, `shardCount`, `shardTargetMb`, `workerCount`). It also reads env knobs such as `JEST_WORKERS`, `JEST_SHARDS` and `JEST_PROCESS_BUDGET_MB`. This file holds the orchestration and `machine-budget` holds the arithmetic.
- **`../modules-on-disk`**: provides `REPO_ROOT`, used as `cwd` for every spawned jest process.

## Notes
- Exit code 2 means a usage error: the first argument names no known suite, or several suites were given in sharded mode. Combining suites requires `--unsharded`.
- Sharded mode takes exactly one suite.
- A single worker must use `--runInBand`. A CLI `--maxWorkers=1` can't unset the config's `workerIdleMemoryLimit`, and a 419-file unit run once reported nothing for 87 minutes that way.
- A parallel layer is not sharded by default. Worker recycling already handles its memory, and extra shards would cost a fresh `mongod` boot each.
- Coverage, the JSON report and randomized-order runs use `--unsharded` because they need every pattern in one process.
