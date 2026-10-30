---
source: scripts/mutation/ci/merge.ts
sha256: 9c750957a7dca1eb141942aaf8256e29422f62ad6e137b08764749330f336ca1
generated_at: 2026-10-29T01:38:40.048239+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/merge.ts

## Purpose

Folds the individual Stryker mutation-test reports produced by each shard in a GitHub sweep into a single unified report—one HTML page, one `mutation.json` for the ratchet, one summary on the run page. It also provides `overlayReport`, which layers a local partial run over an existing whole report so the on-disk artifact stays complete.

## Key elements

- **`StrykerReport` / `ReportMutant` / `ReportTest`** — Typed subset of Stryker's `mutation-testing-report-schema` that this module reads and writes.
- **`ShardReport`** — A finished shard: its `CiShard` plan entry plus its `StrykerReport`.
- **`MergeResult`** — The merged `StrykerReport` plus a sorted list of `incomplete` files that were excluded.
- **`incompleteFiles(scope, finished)`** — Returns scope files whose line ranges are not fully covered by any finished shard (judged by line spans, not report contents).
- **`mergeTests(reports)`** — Re-keys every report's tests into one canonical list per test file (keyed by `file|name|line`) and returns per-report id-maps for remapping `coveredBy`/`killedBy`.
- **`collectMutants(finished)`** — Walks all reports in order, recording each mutant's first non-skipped result per file.
- **`mergeReports(finished, scope)`** — Main entry point. Combines tests, collects mutants, drops incomplete files, renumbers ids, strips the shard-local `config` field, and returns a `MergeResult`.
- **`overlayReport(whole, partial)`** — Overlays a partial run's files onto a whole report; files present in the partial run take the new result, others are kept. Renumbers mutant and test ids the same way.
- **`renderHtml(template, report)`** — Splices the merged JSON into a shard's `index.html` at the `app.report =` line, using Stryker's `<`-escape convention.
- **`formatSummary({report, incomplete, weakest})`** — Produces the GitHub Markdown summary block (score, status table, weakest files).
- **`mutantKey`** (internal) — Derives a stable mutant identity from `mutatorName|replacement|start-end location`, independent of Stryker's per-report `id`.
- **`skippedBySlice`** (internal) — True when a mutant is `Ignored` with `statusReason === SLICE_IGNORE_REASON`.

## Relationships

- **`scripts/mutation/ci/slice-ignorer.ts`** — Imports `SLICE_IGNORE_REASON` to recognise mutants that a sibling shard intentionally skipped.
- **`scripts/mutation/ci/waves.ts`** — Imports the `CiShard` and `ScopeFile` types and the `spanOf` helper (line-range of a shard unit) used by `incompleteFiles`.
- **`scripts/mutation/run-diff.ts`** — Consumes `overlayReport` after a local diff run to keep the on-disk report whole (referenced in the `overlayReport` doc comment).
- **`scripts/mutation/ci/cli.ts`** — Graph neighbor; the CI CLI layer that invokes `mergeReports`, `renderHtml`, and `formatSummary` after shards finish.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — Unit tests for the merge logic, incompleteness detection, and HTML rendering.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Tests the `spanOf`/`CiShard` helpers that `incompleteFiles` depends on.

## Notes

- **Mutant identity is structural, not id-based.** Stryker assigns per-report numeric ids, so this module keys mutants by `mutatorName|replacement|location` and renumbers them on output.
- **Test ids are re-keyed by `file|name|line`.** The same test appearing in multiple shard reports collapses to one canonical entry; `coveredBy`/`killedBy` arrays are remapped through per-report id-maps.
- **Incomplete files are excluded, not partial-scored.** If any scope file's lines are not fully covered by finished shards, it is dropped from the merged report entirely so the ratchet records nothing rather than a misleading partial score.
- **First report wins for edge nodes.** A mutant that crosses a slice boundary appears in two shards; the first shard in the `finished` array provides the result.
- **The `config` field is stripped** from the merged top level because it names only one shard's `--mutate` glob list.
- **`renderHtml` is fragile by design.** It locates the `app.report =` line by string search and throws if a future Stryker release changes the template layout.
- **JSON-in-HTML escaping** uses `replaceAll('<', '<"+"')` inside a `<script>` context to prevent premature tag closure.
- Uses `toSorted` (ES 2023 non-mutating sort) throughout; the project targets a runtime that supports it.
