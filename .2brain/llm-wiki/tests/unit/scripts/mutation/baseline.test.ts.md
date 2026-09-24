---
source: tests/unit/scripts/mutation/baseline.test.ts
sha256: bea73b8faa56b3a3d8c814f39fd32031b7e028ca5315d3a0583349e1ec80bb81
generated_at: 2026-09-23T20:31:19.524210+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/baseline.test.ts

## Purpose

Unit tests for the per-file mutation ratchet gate (`scripts/mutation/baseline.ts`). They pin the core asymmetry — improvements move the baseline up, regressions never move it down — and the partial-run guards, using synthetic Stryker-shaped reports so the suite runs in milliseconds rather than requiring a full mutation run.

## Key elements

- **`report(...)`, `scores(...)`, `baselineOf(...)`** — tuple-based fixture builders that avoid file-path keys tripping the naming-convention lint rule.
- **`describe('scoresFromReport')`** — verifies killed/timeout/non-viable mutant classification, the 100-vs-0 edge cases, and per-file independence.
- **`describe('compareToBaseline')`** — covers verdicts (`regressed`, `improved`, `held`, `new`, `removed`) and the `SCORE_TOLERANCE` dead-band.
- **`describe('nextBaseline — the ratchet')`** — the critical monotonicity tests: a regression must *not* rewrite the baseline downward; also covers new-file recording, file removal, and `generatedAt` stamping.
- **`describe('formatRegressions')`** — checks the human-readable failure message names the file, both numbers, the report path, and the `mutation:check` escape hatch.
- **`describe('compareMerged')` / `describe('mergeIntoBaseline')`** — the sharded-sweep path: unmeasured files are left untouched (not marked `removed`), and the ratchet still keeps the higher value.
- **`describe('readReportsUnder')`** — temp-directory test that verifies `mutation.json` files are discovered and merged from arbitrary subdirectory depths.
- **`describe('missingFromReport')`** — the partial-run guard that names files a report left out, preventing a single-file `stryker run` from silently wiping the rest of the baseline.

## Relationships

- **`scripts/mutation/baseline.ts`** — the sole import target. Every `describe` block exercises a function or constant exported from that module (`scoresFromReport`, `compareToBaseline`, `nextBaseline`, `formatRegressions`, `compareMerged`, `mergeIntoBaseline`, `readReportsUnder`, `missingFromReport`, `SCORE_TOLERANCE`, `MutationBaseline` type).

## Notes

- The ratchet's "keep the higher value" case is called out in comments as the single most important test in the file: if `--update` could rewrite the baseline downward, the gate becomes decorative.
- `readReportsUnder` is the only block that touches the real filesystem (via `mkdtempSync`); all other tests are purely in-memory against synthetic report objects.
- The tuple-fixture convention (`report(...[string, string[]][])`) exists specifically to sidestep a lint rule that fires on `'<path>.ts'` object keys — do not "clean it up" into object literals.
- `SCORE_TOLERANCE` is described in comments as a measurement-error bar for the timeout/survivor race on flaky hardware, not a business-level slack.
