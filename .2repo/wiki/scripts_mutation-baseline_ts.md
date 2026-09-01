# scripts/mutation-baseline.ts

## Purpose

Implements a per-file mutation-score ratchet on top of Stryker's globally-thresholded output. It reads a Stryker JSON report, scores each file individually, compares against a committed per-file baseline, and produces the updated baseline (scores only ever move up). This exists so that one strong file cannot mask a regression in another, and so a drop in coverage of existing assertions is caught per-file rather than buried in an aggregate.

## Key elements

- **`MutationProfile` / `MUTATION_PROFILES`** — Describes the two Stryker scopes (`unit`, `deep`) by their report path and baseline file path. `unit` is the fast nightly default; `deep` also covers integration tests.
- **`profileFromArguments`** — Maps CLI flags (`--deep`) to a `MutationProfileName`; defaults to `unit`.
- **`SCORE_TOLERANCE`** (const, `1`) — One-point band that absorbs the timeout/survivor nondeterminism so the gate doesn't flake under machine load.
- **`scoresFromReport`** — Computes a per-file percentage (killed / viable mutants) from a Stryker report. Files with zero viable mutants are scored 100 to avoid a permanent false alarm.
- **`readReport` / `readBaseline` / `writeBaseline`** — Thin file I/O for the Stryker report and the committed JSON baseline, keyed by profile.
- **`compareToBaseline`** — Returns a `FileComparison[]` with a verdict per file: `held`, `improved`, `regressed`, `new`, or `removed`.
- **`missingFromReport`** — Flags baseline files absent from the current report; used to reject recording a partial-run report.
- **`nextBaseline`** — Builds the baseline to commit. Uses `Math.max(previous, current)` per file so scores never decrease automatically.
- **`formatRegressions`** — Human-readable multi-line message listing regressed files and explaining how to re-record intentionally.

## Relationships

- **`scripts/check-mutation-baseline.ts`** — Consumes the exports here (`readReport`, `readBaseline`, `compareToBaseline`, `nextBaseline`, `missingFromReport`, `writeBaseline`, `formatRegressions`, `profileFromArguments`, `MUTATION_PROFILES`) to perform the actual CI check or `--update` write.
- **`tests/unit/scripts/mutation-baseline.test.ts`** — Unit-tests the scoring, comparison, ratchet, and partial-report-guard logic in this file.

## Notes

- **Ratchet asymmetry is intentional.** `nextBaseline` only raises scores; a regressed file keeps its old (higher) baseline value and keeps failing until genuinely fixed. Lowering a baseline is a human decision made in a commit with a stated reason.
- **Do not mix profiles.** A `unit` score is only comparable to another `unit` score; comparing against a `deep` baseline (or vice versa) misreads every integration-covered file.
- **Partial-run guard.** `missingFromReport` must be checked before calling `nextBaseline` + `writeBaseline`; otherwise a `--mutate` run on a single file silently drops every other file from the ratchet.
- **`Timeout` counts as killed.** This follows Stryker's own convention; the file's `KILLED` set includes it.
- **Frontend mirror.** The header comment states the frontend maintains a parallel copy of this logic. Keep them in sync when changing scoring or comparison semantics.
- **Scoring edge case.** A file where every mutant is `RuntimeError`/`CompileError`/`Ignored` receives a score of 100, not 0, to prevent a permanent "untested" alarm.
