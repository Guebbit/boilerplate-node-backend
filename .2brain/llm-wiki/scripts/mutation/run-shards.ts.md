---
source: scripts/mutation/run-shards.ts
sha256: edca3957271d47fb4774c032340a860444346e9079b5cd5597d6b5a43bd0974a
generated_at: 2026-10-01T12:33:42.977303+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-shards.ts

## Purpose

CLI entry point (`npm run mutation:full`) that runs the entire mutation scope in bin-packed shards, one at a time, banking each shard's report to disk after it completes. It exists because Stryker writes no report when killed mid-run; an unsharded multi-hour pass would lose everything on interruption, whereas per-shard reports survive and can be resumed across sessions.

## Key elements

- **`main`** — Orchestrates the sweep: prints the plan, runs each outstanding shard sequentially, checks whether all shards now have a report, and either merges into the baseline or reports the scope as still open.
- **`runShard(name, mutate, index)`** — Runs Stryker for one shard via `runStryker`, verifies a report file appeared (mtime ≥ start), then copies it into the shard's directory under `reportRoot`. Returns a boolean for "banked or not."
- **`mergeAll()`** — Spawns `check-baseline.ts --merge --merge-dir=…` to fold all shard reports into the per-file ratchet. Only called when every shard has a report.
- **`selectShards`** (from `local-policy.ts`) — Filters the shard list by `--only`, `--limit`, `--force`, and already-completed state, returning `{ run, done }`.
- **`packIntoShards`** (from `sharding.ts`) — Bin-packs the full scope (from `scopeWithLines()`) into shards of ~`shardLines` lines each.
- **`listArgument` / `numberArgument`** — Minimal `--flag=value` CLI parsers used at module scope to derive `shardLines`, `--limit`, `--only`, `--force`.
- **`printPlan`** — `--list` mode; prints a table of shards with line count, file count, and recorded/outstanding status.
- **`elapsed(since)`** — Formats a duration as `XmYYs` for log lines.

## Relationships

- **`baseline.ts`** — Imports `BASELINE_PATH` (where the final ratchet lives) and `REPORT_PATH` (where Stryker writes its report before it is copied). The merge step ultimately writes through to `BASELINE_PATH`.
- **`local-policy.ts`** — Imports `selectShards` to decide which shards this invocation will run versus skip.
- **`mutate-scope.ts`** — Imports `scopeWithLines` to obtain the full mutation scope with per-file line counts, the input to bin-packing.
- **`sharding.ts`** — Imports `TARGET_LINES_PER_SHARD` (default shard size) and `packIntoShards` (the packing algorithm).
- **`stryker-run.ts`** — Imports `REPO_ROOT` (repo root for path construction) and `runStryker` (the wrapper that actually spawns Stryker for each shard).

## Notes

- **Shard reports are keyed by size.** `reportRoot` is `tmp/reports/mutation-shards/{shardLines}/`. Changing `--shard-lines` changes both the shard partition and the directory, so reports from one size never mix with another.
- **Success ≠ exit 0.** `runStryker` can exit non-zero when `thresholds.break` fires on the shard's average, yet the report is still valid. The script treats "a report file appeared" as the success signal.
- **Baseline is written only on full closure.** If even one shard lacks a report, the baseline is left untouched and the script exits with a hint to re-run. `--merge` (never `--update`) is used because `--update` would drop files the current report doesn't mention.
- **Per-shard incremental cache.** Each shard gets its own `--incrementalFile` under its own subdirectory; a shared cache would be clobbered by whichever shard ran last.
- **State is purely on-disk.** There is no lockfile or DB; "completed" means the report file exists under `reportRoot`. Resuming is just running the same command again.
- **`--no-merge`** lets you close the scope (all reports present) without touching the baseline — useful for dry validation.
