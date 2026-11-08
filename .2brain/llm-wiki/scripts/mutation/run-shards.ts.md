---
source: scripts/mutation/run-shards.ts
sha256: 0b364f846779ea9e4560413a87e7e0cd488ba9a95898230085c5ae0887723f8c
generated_at: 2026-11-08T02:54:33.990706+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-shards.ts

## Purpose

Executes the full mutation scope in bin-packed shards, running them sequentially and banking each shard's Stryker report to disk. It exists because Stryker writes no report when killed mid-run, so a single unsharded pass would lose all progress on interruption; this script ensures each completed shard's result is durable, and only merges into the baseline once every shard in the scope has a report. Invoked as `npm run mutation:full`.

## Key elements

- **`main()`** — Entry point. Handles `--list`, runs selected shards in order, checks whether the scope is closed, and optionally merges into the baseline. Returns the process exit code.
- **`runShard(name, mutate, index)`** — Spawns Stryker for one shard (narrowing `--mutate`), verifies a fresh report appeared, and copies it into `tmp/reports/mutation-shards/<shardLines>/<name>/`.
- **`mergeAll()`** — Spawns `scripts/mutation/check-baseline.ts --merge --merge-dir=…` to fold all shard reports into the per-file ratchet. Returns the child's exit code.
- **`printPlan()`** — Logs each shard's name, line count, file count, and recorded/outstanding state.
- **`listArgument(flag)` / `numberArgument(flag)`** — Parse comma-separated or numeric CLI values (`--only=…`, `--limit=…`, `--shard-lines=…`).
- **`SHARD_ROOT` / `reportRoot`** — Report directory under `tmp/` (gitignored), keyed by shard size so sweeps at different sizes never mix.
- **`shards`** — The bin-packed shard list produced by `packIntoShards(scopeWithLines(), shardLines)`.
- **`{ run, done }`** — The selected work-list after applying `--only`, `--limit`, `--force`, and already-completed shards (from `selectShards`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/mutation/sharding.ts` | Provides `TARGET_LINES_PER_SHARD` default and `packIntoShards` to split the scope. |
| `scripts/mutation/mutate-scope.ts` | Provides `scopeWithLines()` — the set of files with their line counts to be packed. |
| `scripts/mutation/local-policy.ts` | Provides `selectShards` to resolve which shards to run vs. skip given CLI flags. |
| `scripts/mutation/stryker-run.ts` | Provides `runStryker` to actually spawn the Stryker process for each shard. |
| `scripts/mutation/baseline.ts` | Provides `BASELINE_PATH` and `REPORT_PATH` constants; this script reads the report path to verify a shard produced output. |
| `scripts/modules-on-disk.ts` | Provides `REPO_ROOT` for constructing absolute paths. |
| `scripts/cli.ts` | Provides `flagValue` and `hasFlag` for reading CLI flags. |
| `scripts/fail-script.ts` | Provides `failScript` as the top-level `.catch` handler for unhandled rejections. |
| `scripts/cli.ts` (as entry) | `npm run mutation:full` in the package script maps to this file's shebang. |

## Notes

- **Shard size is part of the identity.** The report directory is `tmp/reports/mutation-shards/<shardLines>/`. Changing `--shard-lines` (or `TARGET_LINES_PER_SHARD`) creates a fresh directory; prior reports at the old size are invisible to the new sweep.
- **Success ≠ Stryker exit 0.** `thresholds.break` fires on the *average* over whatever files a shard holds, which is not a verdict about any single file. The per-file ratchet at merge time is the real gate. `runShard` only checks that a report file appeared with an mtime newer than the shard's start.
- **`--merge`, never `--update`.** `check-baseline.ts --merge` is monotonically non-decreasing and preserves files it didn't measure. `--update` would treat the shard report as the entire scope and drop every unmeasured file.
- **Baseline is written only on a closed scope.** If even one shard lacks a report, `main` returns early and leaves `BASELINE_PATH` untouched.
- **Per-shard incremental cache.** Each shard gets its own `incremental.json` under its report directory. A shared cache would cause each shard to discard the previous shard's mutation results.
- **`--force`** re-runs already-recorded shards (and passes `--force` to Stryker to bypass its own cache), but does not clear previously banked reports.
