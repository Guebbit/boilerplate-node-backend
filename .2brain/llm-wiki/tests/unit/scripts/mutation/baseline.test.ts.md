---
source: tests/unit/scripts/mutation/baseline.test.ts
sha256: bea73b8faa56b3a3d8c814f39fd32031b7e028ca5315d3a0583349e1ec80bb81
generated_at: 2026-11-08T10:38:10.962760+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/baseline.test.ts

## Purpose

Unit tests for the per-file mutation-score ratchet in `scripts/mutation/baseline.ts`. The ratchet is a gate: improvements move the baseline up, regressions never move it down. Tests are driven against synthetic Stryker-shaped reports so the logic is verifiable without a multi-minute mutation run.

## Key elements

- **`scoresFromReport`** — verifies scoring rules: timeouts count as killed; `CompileError`/`RuntimeError`/`Ignored` are excluded from the denominator; a file with zero viable mutants scores 100 (not 0); all-survived files score 0.
- **`compareToBaseline`** — verifies verdict assignment (`regressed`, `improved`, `held`, `new`, `removed`) and that drops within `SCORE_TOLERANCE` do not fail.
- **`nextBaseline`** — pins the core ratchet invariant: a regressed file keeps its prior (higher) score; improvements are recorded; new files are recorded at first-measured value; files no longer in scope are dropped; the result is monotonic across sequential runs.
- **`formatRegressions`** — checks the human-readable failure message names the file, both scores, the report path, and the `mutation:check` escape hatch.
- **`compareMerged`** — verifies that a sharded/partial run does not flag unmeasured files as `removed`, while still catching regressions among measured files.
- **`mergeIntoBaseline`** — ratchet behavior across a sharded sweep: unmeasured files stay untouched, regressions keep the higher value, new files are added.
- **`readReportsUnder`** — reads `mutation.json` shards from a temp directory tree and merges them into per-file scores (uses `mkdtempSync`/`rmSync` in `beforeEach`/`afterEach`).
- **`missingFromReport`** — the partial-run guard: returns the list of baseline files absent from the current report so a partial run can be refused rather than silently rebuilding the baseline from a subset.

## Relationships

- **`scripts/mutation/baseline.ts`** — the module under test; all functions and the `MutationBaseline` type are imported from it. The tests exercise every exported function.

## Notes

- Fixtures are built from `[file, statuses]` / `[file, number]` **tuples** rather than object literals because string-literal file-path keys trip a naming-convention lint rule; disabling the rule per line was judged noisier than the helper.
- The `SCORE_TOLERANCE` constant is described in comments as a measurement error bar for the timeout/survivor race, not as deliberate slack — a gate that fails on machine load gets removed.
- The test named "KEEPS the higher value when a file regressed" (in both `nextBaseline` and `mergeIntoBaseline`) is flagged in comments as the single most important case: if a regression could rewrite the baseline downward, `--update` would launder every drop.
- `missingFromReport` exists because `stryker run --mutate '<single-file>'` produces a report with only that file; recording from it would silently drop all other baseline entries and let subsequent full runs re-record current scores as if they were always the baseline.
