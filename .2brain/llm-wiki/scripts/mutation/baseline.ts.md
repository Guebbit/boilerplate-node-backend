---
source: scripts/mutation/baseline.ts
generated_at: 2026-11-22T02:07:36.068132+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/baseline.ts

## Purpose
Implements the per-file mutation ratchet. Stryker's thresholds are global, so a strong file can mask a weak one. This module instead records each file's mutation score in a committed baseline JSON file and compares later runs against it. A file that drops fails, a file that improves is raised, and a new file is recorded at whatever it first scores. Baselines are never lowered automatically. Lowering one is a deliberate human decision made in a commit.

## Key elements
- `REPORT_PATH`: the path where Stryker's JSON reporter writes its report (set to `tmp/reports/mutation/mutation.json`).
- `BASELINE_PATH`: the path of the committed ratchet file (set to `mutation-baseline.json`).
- `SCORE_TOLERANCE` (`1`): the allowed drop in percentage points before a file counts as regressed. It absorbs timeout/survivor measurement noise and is not intended as slack.
- Types:
  - `MutationBaseline` holds `generatedAt` and `files`, a map of path to score.
  - `FileVerdict` is `held | improved | regressed | new | removed`.
  - `FileComparison` holds `file`, an optional `baseline`, an optional `current` and a `verdict`.
- `scoresFromReport(report)`: computes the per-file score as a percentage rounded to 2 decimals.
  - `Killed` and `Timeout` count as killed.
  - `RuntimeError`, `CompileError` and `Ignored` are dropped from the denominator.
  - A file with no viable mutants scores 100.
- `readReport()`: reads the single report at `REPORT_PATH` relative to `process.cwd()`. It throws if the report is missing.
- `readReportsUnder(dir)`: recursively finds every `*mutation.json` under a directory and merges the scores. It is used for sharded sweeps, where shards partition the file set so keys don't collide.
- `readBaseline()` / `writeBaseline()`: read the baseline, returning `undefined` if absent, and write it as 4-space JSON with a trailing newline.
- `compareToBaseline(current, baseline?)`: returns a sorted `FileComparison[]` over the union of files.
  - `new`: the file has no baseline.
  - `removed`: the file is absent from the current run.
  - `regressed`: the score is below the baseline minus the tolerance.
  - `improved`: the score is above the baseline.
  - `held`: anything else.
- `compareMerged(current, baseline?)`: the same comparison with `removed` entries filtered out, for partial mid-sweep runs.
- `nextBaseline(current, baseline?)`: builds the baseline for a full run. It contains only the files in `current`, each taking `max(old, new)`.
- `mergeIntoBaseline(current, baseline?)`: the merge-job variant. It keeps all existing entries and raises only the files that were measured, using the same max rule.
- `missingFromReport(current, baseline?)`: lists baseline files absent from the report, sorted. It guards against recording a partial run.
- `formatRegressions(comparisons)`: builds a human-readable summary of regressed files showing baseline and current scores. It returns an empty string when nothing regressed. The rest of the file is not shown here.

## Relationships
The neighbor scripts `check-baseline.ts`, `pull-report.ts`, `run-diff.ts` and `run-shards.ts` are the consumers. They use this module's read, compare and write helpers for the report and baseline. The unit test `tests/unit/scripts/mutation/baseline.test.ts` covers it.

## Notes
- All paths resolve against `process.cwd()`, so scripts must be run from the repo root.
- Use `compareToBaseline` and `nextBaseline` only for whole-scope runs. Use `compareMerged` and `mergeIntoBaseline` for partial or sharded results. Otherwise, files not yet measured would be reported as removed or dropped from the baseline.
- Recording a partial run (for example `--mutate` on one file) would erase the other files' baselines, so check `missingFromReport` first.
- A regressed file keeps its old, higher baseline, so it keeps failing until it is genuinely fixed.
- The frontend keeps its own copy of this module with the same shape.
