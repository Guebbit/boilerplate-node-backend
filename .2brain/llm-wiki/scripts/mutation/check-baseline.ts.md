---
source: scripts/mutation/check-baseline.ts
source_sha256: 908ba1ae3a6afe977be004efc4fc4e1f393b9160139e6f34958a4eec8c97a724
context_sha256: 9834f0e63d7c29769a82c395b6252317a34396bbfb97565a61baaf1808a937dd
generated_at: 2026-11-22T02:07:51.908063+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/check-baseline.ts

## Purpose
A CLI script that implements a per-file mutation-testing "ratchet". It compares the per-file mutation scores from the last Stryker run (the report written by the `json` reporter) against the recorded baseline (located by `BASELINE_PATH` in `scripts/mutation/baseline.ts`), failing if any file regressed. It does not run Stryker itself, so the check is cheap and can be split across CI steps.

## Key elements
This is a top-level script with no exports. Its flow is:

- **Flags**: `--update` records the run's scores. `--merge` folds sharded reports into the baseline and requires `--merge-dir=<path>`.
- **Loading `current`**: reads scores with `readReportsUnder(mergeDirectory)` in merge mode, otherwise `readReport()`. A read failure prints the message and exits 2.
- **No baseline yet**: without `--update` or `--merge`, it logs a notice and exits 0 without writing anything. With either flag, it writes a first baseline via `nextBaseline(current)`.
- **`printProgress(comparisons, recorded)`**: logs `improved` files. It logs `new` files only when `recorded` is true. This runs even on passing runs so the ratchet's progress is visible.
- **Merge path** (`--merge`): uses `compareMerged`, prints progress, writes `mergeIntoBaseline(current, baseline)`, then exits 1 if `formatRegressions` reports any, otherwise 0.
- **Partial-report guard**: `missingFromReport` finds baseline files absent from the report. `--update` with any missing files exits 1 ("Refusing to update").
- **Single-run path**: `compareToBaseline` gives a verdict per file (`held`, `improved`, `new`, `removed`, `regressed`). The script prints `removed` files and a summary line with counts. A regression exits 1. A passing `--update` writes `nextBaseline(current, baseline)`.

**Exit codes**: 0 means fine, 1 means a file regressed or `--update` was refused, 2 means no report or bad arguments.

## Relationships
- `./baseline` (`scripts/mutation/baseline.ts`) holds all the logic this script calls: report reading, comparison, formatting, baseline reading and writing, and `BASELINE_PATH`. It also provides the `FileComparison` type.
- `../cli` (`scripts/cli.ts`) provides `hasFlag` and `flagValue` for argument parsing.

## Notes
- A first baseline is deliberately never written by a bare check. This stops a local partial run from creating a partial baseline.
- On a regressing `--update`, the baseline is still rewritten, but `nextBaseline` keeps the higher score per file. A regressed file therefore keeps its old baseline and stays failing.
- The `--merge` path leaves files that no shard measured untouched. Sharded sweeps belong under `--merge`, not `--update`.
- The top-of-file comment says the frontend's copy of this CLI omits `--merge`.
