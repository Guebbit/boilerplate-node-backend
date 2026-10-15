---
source: scripts/mutation/run-shards.ts
sha256: fef11c465667726567ca665bbdffe4f6da117826c146514ab58228eee9e69ad0
generated_at: 2026-10-15T09:43:32.814400+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-shards.ts

## Purpose

CLI entry point for `npm run mutation:full`. Splits the full mutation scope into bin-packed shards (by line count) and runs them sequentially, copying each completed shard's Stryker report to a persistent directory before starting the next. Exists because Stryker writes no report when killed mid-run; sharding guarantees partial progress is preserved on disk. When every shard has a report, the scope is "closed" and all shard reports are merged into the per-file baseline ratchet.

## Key elements

- **`main()`** — Top-level orchestrator. Handles `--list` (print plan and exit), otherwise iterates `runShard` over selected shards, checks coverage, and either exits (scope not closed) or calls `mergeAll`. Returns an exit code that becomes `process.exit`.
- **`runShard(name, mutate, index)`** — Spawns Stryker via `runStryker` with a narrowed `--mutate` list and a per-shard `--incrementalFile`. After Stryker finishes, verifies a report appeared (via `stat` mtime > start time) and copies it into `reportRoot/<name>/`.
- **`mergeAll()`** — Spawns `npx tsx scripts/mutation/check-baseline.ts --merge --merge-dir=<reportRoot>`. Uses `--merge` (not `--update`) so files absent from the combined report are not dropped from the baseline.
- **`selectShards(shards, { completed, only, limit, force })`** — Imported from `local-policy.ts`; decides which shards this invocation will actually run.
- **`packIntoShards(scopeWithLines(), shardLines)`** — Imported from `sharding.ts`; produces the bin-packed shard list at module load.
- **`printPlan()`** — `--list` mode: prints shard names, line counts, file counts, and recorded/outstanding state.
- **`listArgument()` / `numberArgument()`** — Small CLI-flag parsers built on `flagValue` from `cli.ts`.
- **`reportRoot`** — `tmp/reports/mutation-shards/<shardLines>/`; the per-size directory where shard reports are banked. Gitignored via `tmp/`.

## Relationships

- **`scripts/mutation/mutate-scope.ts`** — Supplies `scopeWithLines()`, the full scope (files + line counts) that gets sharded.
- **`scripts/mutation/sharding.ts`** — Supplies `packIntoShards` (bin-packing algorithm) and `TARGET_LINES_PER_SHARD` (default shard size).
- **`scripts/mutation/local-policy.ts`** — Supplies `selectShards`, which applies `--only`, `--limit`, `--force`, and already-completed filtering.
- **`scripts/mutation/stryker-run.ts`** — Supplies `runStryker`, which actually spawns the Stryker process with the given args and label.
- **`scripts/mutation/baseline.ts`** — Supplies `BASELINE_PATH` (where the merged ratchet lives) and `REPORT_PATH` (where Stryker's output lands before copying).
- **`scripts/modules-on-disk.ts`** — Supplies `REPO_ROOT` used for all path construction.
- **`scripts/cli.ts`** — Supplies `flagValue`, the shared CLI flag-value reader.

## Notes

- **Shard-size keying:** The report directory is `…/<shardLines>/`. Changing `--shard-lines` changes every shard's name and contents, so a sweep at one size will not accidentally fold a different size's reports into the merge.
- **Success ≠ exit 0:** A shard is considered banked only if a report file appeared (checked via `stat` mtime). Stryker may exit non-zero due to `thresholds.break` on the shard's average, but the per-file ratchet at merge time is the real verdict.
- **Baseline written only on full coverage:** If even one shard lacks a report, the baseline file is left untouched and the script exits 0 (if all *selected* shards ran successfully) or 1 (if one failed). No partial baseline is ever written.
- **Per-shard incremental cache:** Each shard gets its own `incremental.json` under its report subdirectory; a shared cache would cause each shard to discard the previous shard's mutation results.
- **`--no-merge`** skips the final merge step entirely, useful for collecting data without touching the recorded baseline.
