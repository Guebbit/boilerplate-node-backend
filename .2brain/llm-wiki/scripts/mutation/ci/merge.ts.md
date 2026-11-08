---
source: scripts/mutation/ci/merge.ts
sha256: 9c750957a7dca1eb141942aaf8256e29422f62ad6e137b08764749330f336ca1
generated_at: 2026-11-08T02:52:56.588885+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/merge.ts

## Purpose

Folds the Stryker reports from every finished shard of a GitHub mutation sweep into a single unified report (one HTML page, one `mutation.json`, one summary), and also provides a utility to overlay a local partial diff-run onto a pre-existing whole report. It handles the cross-shard bookkeeping that Stryker cannot do on its own: deduplicating edge-node mutants, re-keying per-report test IDs, and excluding files that no shard fully covered.

## Key elements

- **`StrykerReport`** – Typed subset of Stryker's `mutation-testing-report-schema` (files, testFiles, plus open `[field: string]: unknown` for pass-through).
- **`ShardReport`** – Pairs a `CiShard` plan entry with its `StrykerReport`.
- **`MergeResult`** – The merged `StrykerReport` plus a sorted `incomplete` file list.
- **`incompleteFiles(scope, finished)`** – Returns scope files whose line ranges are not fully covered by any finished shard's units (judged by `spanOf` line spans, not by report contents).
- **`mergeReports(finished, scope)`** – The main merge: collects mutants per file (first non-skipped result wins), merges test IDs across reports, strips the shard-local `config`, drops incomplete files, and returns a new `MergeResult`.
- **`overlayReport(whole, partial)`** – Layers a partial run over an existing whole report; files present in the partial report replace the whole report's entries for those files, others are kept. Renumberes mutant and test IDs.
- **`renderHtml(template, report)`** – Injects the merged report JSON into a shard's Stryker `index.html` by replacing the `app.report = …` line. Throws if the marker line is absent (Stryker layout change).
- **`formatSummary({ report, incomplete, weakest })`** – Produces a GitHub-flavoured Markdown summary (score, status table, weakest files, incomplete file list) for the run page.
- **`mutantKey`** (internal) – Stable identity string for a mutant: `mutatorName|replacement|start.line:start.col-end.line:end.col`.
- **`skippedBySlice`** (internal) – True when a mutant's status is `Ignored` with reason `SLICE_IGNORE_REASON`.
- **`mergeTests`** (internal) – Deduplicates tests across reports by `file|name|line`, renumbers IDs, and returns per-report ID maps for remapping `coveredBy`/`killedBy`.

## Relationships

- **`scripts/mutation/ci/slice-ignorer.ts`** – Imports `SLICE_IGNORE_REASON` to recognise mutants that were intentionally skipped by a sibling slice.
- **`scripts/mutation/ci/waves.ts`** – Imports `CiShard`, `ScopeFile` types and the `spanOf` helper used to compute covered line ranges for the incompleteness check.
- **`scripts/mutation/ci/cli.ts`** – Downstream consumer; the CI CLI orchestrates the sweep and calls `mergeReports`, `renderHtml`, and `formatSummary` to produce the final artifact and run-page output.
- **`scripts/mutation/run-diff.ts`** – Calls `overlayReport` after a local diff mutation run to keep the on-disk report whole.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** – Unit tests for the merge, overlay, and HTML-rendering logic.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** – Tests `waves.ts` (a dependency); relevant because `incompleteFiles` relies on `spanOf` behaviour.

## Notes

- **First-report-wins for edge nodes.** A mutant that crosses a slice boundary appears in two shards' reports; `mergeReports` keeps the result from whichever shard appears first in the `finished` array. Callers must pass shards in a stable, deterministic order.
- **Incomplete files are excluded, not scored.** If any slice of a file is uncovered, the entire file is dropped from the merged report so the ratchet records nothing rather than a partial score. Additionally, if a file has mutants that were *all* skipped by every slice (an invariant that should not hold when every slice finishes), it is also excluded.
- **`config` is stripped** from the merged top-level object because it only names one shard's `--mutate` list.
- **Test IDs are per-report in Stryker.** `mergeTests` re-keys them by `file|name|line` and renumbers, then remaps every `coveredBy`/`killedBy` reference. The ID maps are positional (indexed by report order in the `finished` array).
- **HTML rendering is fragile by design.** `renderHtml` locates the `app.report =` line by prefix match; if Stryker changes its HTML layout the call throws a descriptive error rather than silently producing a broken page.
- **JSON `<` escaping** in `renderHtml` (`<` → `<"+"`) follows Stryker's own convention to prevent premature `</script>` closure.
