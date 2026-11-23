---
source: scripts/mutation/run-shards.ts
source_sha256: 3095679aa466eaebb39b7968a9e56d8328df0d4bf73153c121cb7eea0b2d1f1d
context_sha256: 14f5adb8b3193f440340483ab6ab02775c0ab8829b83baf2c46e3995433488be
generated_at: 2026-11-22T02:10:31.774892+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/run-shards.ts

## Purpose
CLI entry point for `npm run mutation:full`. It runs the whole Stryker mutate scope on one machine as a series of shards, one at a time. Each shard's report is kept on disk. Stryker writes no report when killed mid-run, so one long unsharded pass would bank nothing if interrupted. With shards, a stopped sweep keeps the finished shards and resumes at the next one. The baseline is updated only once every shard has a report.

## Key elements
- `SHARD_ROOT` / `reportRoot`: reports are stored under `tmp/reports/mutation-shards/<shardLines>/`. Keying the directory by shard size keeps sweeps of different sizes from mixing.
- `listArgument` / `numberArgument`: parse comma-separated and positive-integer CLI flags (`--only`, `--limit`, `--shard-lines`).
- `shardLines`: lines per shard, from `--shard-lines` or `TARGET_LINES_PER_SHARD`.
- `shards`: the scope bin-packed by `packIntoShards(scopeWithLines(), shardLines)`.
- `shardReport(name)` / `completed`: a shard counts as recorded when its copied per-shard report file exists in the shard's folder.
- `selectShards(...)`: applies `--only`, `--limit` and `--force` to produce `run` (shards to execute now) and `done`.
- `printPlan()`: the `--list` output, showing each shard's lines, file count, and `recorded` or `outstanding` state.
- `runShard(name, mutate, index)`: calls `runStryker` with `stryker.json`, `--mutate <files>`, and a per-shard `--incrementalFile`, and passes `--force` through if given. It banks the shard only if a report newer than the start time appeared, then copies the report directory into the shard folder. Returns whether it banked.
- `mergeAll()`: spawns `npx tsx` on the baseline check script with `--merge` and `--merge-dir=<reportRoot>`, and returns its exit status, or 2 if the status is null.
- `main()`: handles `--list`, runs the selected shards, reports coverage, and merges when the scope is complete. Its return value is the process exit code.

## Relationships
- `./baseline`: supplies `BASELINE_PATH` and `REPORT_PATH`. `REPORT_PATH` is where Stryker's output is read from. `BASELINE_PATH` appears in log messages.
- `./local-policy`: `selectShards` decides which shards run.
- `./mutate-scope`: `scopeWithLines()` provides the files and line counts to pack.
- `./sharding`: `packIntoShards` and `TARGET_LINES_PER_SHARD`.
- `./stryker-run`: `runStryker` executes Stryker for one shard.
- `../modules-on-disk`: `REPO_ROOT` is the base for all paths and the `cwd` of the merge subprocess.
- `../cli`: `flagValue` and `hasFlag` read command-line flags.
- `../fail-script`: `failScript` is the top-level `.catch` handler.

## Notes
- A shard succeeds when a report appears, not when Stryker exits 0. `thresholds.break` applies to the average over whatever files a shard holds, so the final per-file ratchet is the real verdict.
- The merge uses `--merge`, never `--update`. `--merge` never lowers a score or drops files it did not measure.
- `--no-merge` leaves the baseline untouched after the scope closes.
- Exit codes:
  - 0: `--list`, or every selected shard banked.
  - 1: some selected shard did not bank while the scope is still open.
  - 2: nothing selected (a bad `--only`) or a null merge status.
  - Otherwise the merge's exit code.
- Each shard gets its own incremental cache file. A shared one would make each shard discard the previous shard's memory.
- Module-level code computes shards and completion state at import time, so `--list` and normal runs share the same planning.
