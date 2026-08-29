# tests/unit/scripts/mutation-baseline.test.ts

## Purpose

Unit tests for the per-file mutation-score ratchet in `scripts/mutation-baseline.ts`. They pin the asymmetry at the heart of the design—improvements move the baseline up, regressions never move it down—and verify the scoring, comparison, formatting, and partial-run-guard logic against synthetic Stryker-shaped reports so no real 51-minute mutation run is needed.

## Key elements

- **`scoresFromReport` tests** — Verify that killed + timed-out mutants count as detected, non-viable statuses (`CompileError`, `RuntimeError`, `Ignored`) are excluded from the denominator, a file with zero viable mutants scores 100 (not 0), and an all-survived file scores 0 explicitly.
- **`compareToBaseline` tests** — Cover all five verdicts: `regressed` (beyond `SCORE_TOLERANCE`), not-regressed (within tolerance), `improved`, `held`, `new` (no prior entry), and `removed` (file left the mutate scope). Also confirms that with no baseline every file is `new`.
- **`nextBaseline` tests (the ratchet)** — The critical suite. Confirms improvements are recorded, regressions are *kept at the old higher value*, new files are recorded at whatever they first measured (including 0), dropped files are removed, the sequence is monotonic across good→bad runs, and `generatedAt` is a parseable timestamp.
- **`formatRegressions` tests** — Empty string when nothing regressed; otherwise the message names the file, both the baseline and current numbers (to 2 decimals), the Stryker report path, and the `test:mutation:baseline` escape-hatch command.
- **`missingFromReport` tests (partial-run guard)** — Returns the file paths present in the baseline but absent from the current report (a partial `stryker run`). Returns `[]` when the report covers all baseline files, covers *more* (widened mutate), or when no baseline exists yet.
- **Fixtures** — `report()`, `scores()`, `baselineOf()` build Stryker-shaped / baseline objects from `[file, value]` tuples. Constants `FILE`, `OTHER`, `NEWCOMER`, `GONE` give the tuples readable names.

## Relationships

- **`scripts/mutation-baseline.ts`** — Sole production dependency. The test file imports every public export (`SCORE_TOLERANCE`, `compareToBaseline`, `missingFromReport`, `formatRegressions`, `nextBaseline`, `scoresFromReport`, and the `MutationBaseline` type) and exercises each one in isolation.

## Notes

- Fixtures use `[file, value]` tuples rather than object literals because file-path strings as literal keys (`'src/a.ts': …`) trip a naming-convention lint rule; the tuple helper sidesteps per-line lint suppressions.
- `SCORE_TOLERANCE` is documented in-test as a measurement error bar for the timeout/survivor race, not as "slack" to allow real regressions.
- The partial-run guard exists because `stryker run --mutate 'src/one/file.ts'` produces a report containing only that file; recording it would silently drop every other file from the baseline. Running a partial mutation is allowed; *recording* one is refused by the gate.
- The file deliberately avoids invoking a real Stryker run. The header comment frames this as the same reason spec-identity tests use temp directories: a test that needed a 51-minute run would never be run.
