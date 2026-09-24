---
source: scripts/mutation/run-shards.ts
sha256: dc56c947c218081cb9ee477af99eb9e1d3b50e8c0886c015ff3af82e6b1e7b79
generated_at: 2026-09-23T17:28:52.602056+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-shards.ts

## Purpose

Entry point for `npm run mutation:full`. Splits the full mutation scope into bin-packed shards, runs them sequentially with Stryker on a single machine, and banks each shard's report to disk as it completes. Exists because Stryker writes no report if killed mid-run; sharding guarantees partial credit survives interruption. The baseline is merged only after every shard has a report.

## Key elements

- **`main`** – Orchestrates the full sweep: prints plan (`--list`), runs outstanding shards sequentially, checks coverage, then optionally merges into the baseline.
- **`runShard(name, mutate, index)`** – Spawns Stryker for one shard, verifies a fresh report appeared (via `mtime`), and copies it into `reportRoot/<name>/`. Returns `true` only if a new report was written.
- **`mergeAll()`** – Spawns `check-baseline.ts --merge --merge-dir=<reportRoot>` to fold all shard reports into the per-file ratchet. Called only when the scope is fully covered.
- **`shards`** – The bin-packed shard plan, produced by `packIntoShards(scopeWithLines(), shardLines)`.
- **`reportRoot`** – `tmp/reports/mutation-shards/<shardLines>/`; the directory is keyed by shard size so sweeps at different sizes don't mix reports.
- **`selectShards`** (imported) – Applies `--only`, `--limit`, `--force`, and already-completed status to decide what to run.
- **`listArgument` / `numberArgument`** – Small CLI-parsing helpers for `--flag=value` arguments.
- **`printPlan`** – Tabular output of every shard with line count, file count, and recorded/outstanding state.

## Relationships

- **`scripts/mutation/baseline.ts`** – Imports `BASELINE_PATH` (log messages, merge target) and `REPORT_PATH` (where Stryker writes its output before it's copied).
- **`scripts/mutation/local-policy.ts`** – Imports `selectShards` to compute the run-vs-done split from CLI flags and on-disk state.
- **`scripts/mutation/mutate-scope.ts`** – Imports `scopeWithLines` to obtain the full mutation scope annotated with line counts.
- **`scripts/mutation/sharding.ts`** – Imports `TARGET_LINES_PER_SHARD` (default shard size) and `packIntoShards` (bin-packing algorithm).
- **`scripts/mutation/stryker-run.ts`** – Imports `REPO_ROOT` (path resolution) and `runStryker` (the Stryker spawn wrapper used by `runShard`).

## Notes

- **Shard success ≠ exit 0.** `thresholds.break` fires on the shard's average; a non-zero exit still leaves a valid report. The code treats "a fresh report file exists" as success, not the process exit code.
- **`--merge` vs `--update`.** The merge path uses `--merge` (never lowers a score, never drops unmeasured files). `--update` would treat the report as the whole scope and drop files it doesn't mention.
- **Stale-report guard.** `runShard` checks `mtimeMs < startedAt` to reject a report that predates the current shard's run.
- **Per-shard incremental cache.** Each shard gets its own `--incrementalFile` under its report directory; a shared cache would cause each shard to discard the previous shard's cached results.
- **Reports live under `tmp/`**, so they are gitignored and disposable; the only durable artifact is the merged baseline.
