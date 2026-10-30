---
source: scripts/mutation/run-shards.ts
sha256: 0b364f846779ea9e4560413a87e7e0cd488ba9a95898230085c5ae0887723f8c
generated_at: 2026-10-29T01:39:41.214679+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-shards.ts

## Purpose

Orchestrates the full mutation scope on a single machine by splitting it into bin-packed shards, running Stryker on each shard sequentially, persisting each completed shard's report to disk, and — only after every shard has a report — merging all shard reports into the per-file baseline. It exists because Stryker writes no report when killed mid-run, so an unsharded multi-hour pass would lose all progress; sharding guarantees incremental, resumable credit.

## Key elements

- **`main()`** — Entry point. Handles `--list` (print plan), runs the selected shards in order, checks whether the scope is now fully covered, and either merges or reports "not closed yet."
- **`runShard(name, mutate, index)`** — Spawns Stryker via `runStryker` with a per-shard `--mutate` list and a per-shard `--incrementalFile`. After the run, verifies a report file appeared (mtime > start time) and copies it into the persistent shard directory. Returns a boolean "banked" flag.
- **`mergeAll()`** — Spawns `scripts/mutation/check-baseline.ts --merge --merge-dir=<reportRoot>` synchronously. Uses `--merge` (never `--update`) so the baseline is never lowered and unmeasured files are never dropped.
- **`printPlan()`** — Prints each shard's name, line count, file count, and recorded/outstanding status without executing anything.
- **`shards`** — Computed at module load via `packIntoShards(scopeWithLines(), shardLines)`; the fixed bin-packing for the current invocation.
- **`completed`** — Shards whose report file already exists on disk; used by `selectShards` to skip them on resume.
- **`listArgument` / `numberArgument`** — Small CLI helpers that parse comma-separated or numeric `--flag=value` arguments via `flagValue`.

## Relationships

- **`scripts/cli.ts`** — Imports `flagValue` and `hasFlag` for all CLI flag parsing.
- **`scripts/fail-script.ts`** — Imports `failScript` as the unhandled-rejection catch on the top-level `main()` promise.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` as the anchor for all filesystem paths.
- **`scripts/mutation/baseline.ts`** — Imports `BASELINE_PATH` (log messages) and `REPORT_PATH` (where Stryker writes its report before it is copied).
- **`scripts/mutation/local-policy.ts`** — Imports `selectShards` to resolve `--only`, `--limit`, `--force`, and already-completed shards into a concrete run list.
- **`scripts/mutation/mutate-scope.ts`** — Imports `scopeWithLines` to obtain the mutation scope annotated with per-file line counts.
- **`scripts/mutation/sharding.ts`** — Imports `TARGET_LINES_PER_SHARD` (default shard size) and `packIntoShards` (bin-packing algorithm).
- **`scripts/mutation/stryker-run.ts`** — Imports `runStryker` to spawn the actual Stryker subprocess for each shard.
- **`scripts/mutation/check-baseline.ts`** — Spawned via `spawnSync` inside `mergeAll()`; not a static import.

## Notes

- Reports are stored under `tmp/reports/mutation-shards/<shardLines>/`, keyed by shard size. Changing `--shard-lines` produces a different directory so sweeps at different sizes cannot mix reports.
- Shard "success" is defined as *a report file with a newer mtime appeared*, not a zero exit code from Stryker. `thresholds.break` may fire on a shard's small file subset without invalidating the per-file score.
- The baseline is written **only** when every shard in the full scope has a report. A partially-covered scope leaves the baseline untouched and exits with code 0 (all selected shards ran) or 1 (at least one shard failed).
- Each shard is given its own `--incrementalFile` path so Stryker's incremental cache is not clobbered between sequential shards.
- `--force` is passed both to `selectShards` (re-run already-recorded shards) and to Stryker itself (bypass its own cache).
