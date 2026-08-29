# scripts/mutation-baseline.ts

## Purpose

Implements a per-file mutation-testing ratchet. Because Stryker's built-in thresholds are global (one strong file can mask a weak one), this module records each file's mutation score on a real run and enforces that no file silently drops below its recorded value. Scores can only move **up** (via `--update`); lowering a baseline is always a deliberate human decision in a commit.

## Key elements

- **`SCORE_TOLERANCE`** (1 point) — absorbs the timeout-vs-survivor race under machine load; not slack for real regression.
- **`KILLED` / `NOT_VIABLE`** (sets) — which mutant statuses count as detected vs. excluded from the denominator. `Timeout` counts as killed; `RuntimeError`, `CompileError`, `Ignored` are excluded entirely.
- **`scoresFromReport(report)`** — reduces a Stryker JSON report to a per-file percentage map. Files with zero viable mutants are scored 100, not 0.
- **`readReport(root?)`** / **`readBaseline(root?)`** / **`writeBaseline(baseline, root?)`** — I/O helpers for the Stryker report (`reports/mutation/mutation.json`) and the committed baseline (`mutation-baseline.json`).
- **`compareToBaseline(current, baseline?)`** — returns a sorted `FileComparison[]` with verdicts: `held`, `improved`, `regressed`, `new`, `removed`.
- **`missingFromReport(current, baseline?)`** — lists baseline files absent from a (possibly partial) report, guarding against accidental re-baselining that would drop other files.
- **`nextBaseline(current, baseline?)`** — builds the next baseline using `Math.max(previous, current)` per file, so scores never decrease.
- **`formatRegressions(comparisons)`** — human-readable summary of regressed files with guidance on how to respond; returns `''` when clean.
- **`MutationBaseline`**, **`FileComparison`**, **`FileVerdict`** — shared type definitions exported for consumers.

## Relationships

- **`scripts/check-mutation-baseline.ts`** — the CI gate; imports `readReport`, `readBaseline`, `compareToBaseline`, `missingFromReport`, and `formatRegressions` to decide pass/fail and print the summary.
- **`scripts/run-mutation-tests.ts`** — orchestrates the Stryker run and (with `--update`) calls `nextBaseline` + `writeBaseline` to commit a new baseline.
- **`tests/unit/scripts/mutation-baseline.test.ts`** — unit tests covering score computation, comparison verdicts, the ratchet asymmetry, and edge cases (empty files, partial reports).

## Notes

- The frontend has a mirrored copy of this logic; keep them in sync.
- `nextBaseline` builds its key set **only** from the current report's files. If the report is partial (single-file `--mutate`), recording it would silently drop every other file. `missingFromReport` exists to catch this before `writeBaseline` is called.
- `Timeout` is intentionally counted as "killed" (Stryker's own convention): a mutant that hangs the suite *was* detected, just expensively.
- A file whose mutants are all `RuntimeError`/`CompileError`/`Ignored` gets a score of 100, not 0 — there was nothing for tests to catch, so calling it untested would be a permanent false alarm.
- The baseline file (`mutation-baseline.json`) is committed to the repo; `generatedAt` makes a stale baseline visible.
