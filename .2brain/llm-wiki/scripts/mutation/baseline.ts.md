---
source: scripts/mutation/baseline.ts
sha256: 8f0d697eed60931e6819df74ea0c237c26c4db6d98311bc28d39788cc4ef4435
generated_at: 2026-10-01T12:31:55.696216+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/baseline.ts

## Purpose

Implements a per-file mutation-score ratchet that replaces Stryker's single global threshold. It reads Stryker JSON reports, computes a per-file percentage score, compares each file against a committed baseline (`mutation-baseline.json`), and enforces a one-way rule: scores may only move up. This prevents a strong file from masking a weak one and makes a regression in any single file visible and actionable.

## Key elements

- **`REPORT_PATH` / `BASELINE_PATH`** — Fixed file paths: where Stryker's JSON reporter writes and where the committed baseline lives.
- **`SCORE_TOLERANCE`** (1 point) — Absorbs the timeout/survivor race under machine load; not general slack.
- **`scoresFromReport(report)`** — Converts a Stryker JSON report into a `Record<string, number>` of per-file scores (killed / scored, excluding non-viable mutants). Files with zero viable mutants score 100.
- **`readReport(root?)`** — Reads and scores a single report at the fixed `REPORT_PATH`; throws a helpful error if missing.
- **`readReportsUnder(directory)`** — Walks a directory tree (recursively), finds every `mutation.json`, and merges their scores. Used for sharded sweeps where each shard uploads its own report.
- **`readBaseline(root?)` / `writeBaseline(baseline, root?)`** — Read/write the committed `MutationBaseline` JSON.
- **`compareToBaseline(current, baseline?)`** — Full-scope comparison; returns a sorted `FileComparison[]` with verdicts: `new`, `removed`, `regressed`, `improved`, `held`. Used when a run covers the entire mutate scope.
- **`compareMerged(current, baseline?)`** — Partial (sharded) comparison; omits the `removed` verdict because a missing file mid-sweep means "not yet measured," not "left scope."
- **`mergeIntoBaseline(current, baseline?)`** — Builds the next baseline after a merged/partial run; preserves all existing entries and only touches files present in `current`, never lowering a score.
- **`nextBaseline(current, baseline?)`** — Builds the next baseline after a full run; rebuilds the file set from `current`'s keys (dropping genuinely removed files) while still never lowering a score.
- **`missingFromReport(current, baseline?)`** — Returns baseline files absent from a report; used to guard against accidentally recording a partial run as the new baseline.
- **`formatRegressions(comparisons)`** — Human-readable multi-line summary of regressed files plus remediation guidance; returns `''` when nothing regressed.
- **`KILLED` / `NOT_VIABLE`** (module-private) — Sets of Stryker statuses that count as detected vs. excluded from the denominator.

## Relationships

- **`scripts/mutation/check-baseline.ts`** — Primary consumer; calls `readReport`, `readBaseline`, `compareToBaseline`, `missingFromReport`, and `nextBaseline` to implement the `--check` / `--update` CLI flow.
- **`scripts/mutation/ci/cli.ts`** — CI merge-job entry point; calls `readReportsUnder`, `compareMerged`, and `mergeIntoBaseline` to grade a sharded sweep against the baseline.
- **`scripts/mutation/run-shards.ts`** — Produces the per-shard `mutation.json` reports that `readReportsUnder` later walks and merges.
- **`github/workflows/mutation.yml`** — Orchestrates the mutation run, shard upload, merge job, and baseline check steps that exercise this module.
- **`tests/unit/scripts/mutation/baseline.test.ts`** — Unit tests covering scoring, comparison verdicts, ratchet never-lower behavior, and partial-run guards.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Tests the CI wave/merge logic that depends on `compareMerged` and `mergeIntoBaseline`.

## Notes

- **Ratchet asymmetry is intentional.** `nextBaseline` and `mergeIntoBaseline` both use `Math.max(previous, current)`. A regression keeps the old (higher) value so the file stays failing until genuinely fixed. Lowering a baseline is a human decision made in a commit with a stated reason.
- **`compareToBaseline` vs. `compareMerged`** differ only in how they treat files present in the baseline but absent from `current`: the former reports them as `removed`, the latter omits them. Choosing the wrong one mid-sweep either hides real removals or flags not-yet-measured files.
- **Files with zero viable mutants score 100**, not 0, to avoid a permanent false alarm on the ratchet for files where every mutant is `RuntimeError`/`CompileError`/`Ignored`.
- **`missingFromReport` is a guard, not a gate.** It surfaces files the baseline knows that a partial run didn't measure; the caller decides whether to block the write.
- **The frontend keeps its own copy of this file** (same shape) per the header comment, so changes here have no automatic effect on that copy.
- **`SCORE_TOLERANCE` is deliberately tiny (1).** It exists solely to absorb the timeout/survivor race under variable machine load, not to permit genuine weakening.
