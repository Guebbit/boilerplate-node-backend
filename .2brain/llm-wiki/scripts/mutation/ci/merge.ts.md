---
source: scripts/mutation/ci/merge.ts
sha256: 0fac3a9876d799928de9423138ac8010b6fdf1c9daa0a8605d9aca6c6eb8260f
generated_at: 2026-11-14T17:37:18.604140+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/merge.ts

## Purpose

Merges Stryker mutation-testing reports from multiple CI shards (a "GitHub sweep") into a single unified report, and provides the supporting utilities to render that report as HTML and as a GitHub Markdown summary. Also exposes `overlayReport` for layering a local partial run over an existing whole report so the on-disk artifact stays complete.

## Key elements

- **`StrykerReport`** — Typed subset of Stryker's mutation-testing report schema (`files`, `testFiles`, top-level passthrough).
- **`ShardReport`** — Pair of a `CiShard` plan entry and its `StrykerReport`.
- **`MergeResult`** — The merged `StrykerReport` plus a list of `incomplete` file paths that were excluded.
- **`incompleteFiles(scope, finished)`** — Uses line-range coverage from shard units to identify scope files that no finished shard fully covered.
- **`mergeReports(finished, scope)`** — Core merge: collects mutants per file (first non-skipped result wins), re-keys tests to a single id space, renumbers all mutant ids, strips shard-specific `config`, and drops incomplete files.
- **`overlayReport(whole, partial)`** — Replaces only the files present in `partial` with their new results; everything else comes from `whole`. Test and mutant ids are renumbered the same way as in `mergeReports`.
- **`renderHtml(template, report)`** — Swaps the `app.report = …` line inside a shard's Stryker `index.html` with the merged JSON (with `<` escaped to avoid breaking `<script>`). Throws if the marker line is absent.
- **`formatSummary({report, incomplete, weakest})`** — Produces a GitHub-flavored Markdown block with score, status table, and weakest-file list for the run page.
- **`mutantKey`** (internal) — Deterministic identity: `mutatorName|replacement|startLine:startCol-endLine:endCol`.
- **`skippedBySlice`** (internal) — True when a mutant's `statusReason` equals `SLICE_IGNORE_REASON`, meaning another slice is responsible for its real result.
- **`mergeTests`** (internal) — Deduplicates tests across reports by `file|name|line`, returns a unified `testFiles` map and a `remap(index, ids)` helper for translating per-report test-id lists.

## Relationships

- **`scripts/mutation/ci/slice-ignorer.ts`** — Provides `SLICE_IGNORE_REASON`, the sentinel `statusReason` used to recognise mutants deferred to another slice.
- **`scripts/mutation/ci/waves.ts`** — Provides the `CiShard` and `ScopeFile` types and the `spanOf` helper (line range of a shard unit) used by `incompleteFiles`.
- **`scripts/mutation/ci/cli.ts`** — The CI entry point that calls `mergeReports`, `renderHtml`, and `formatSummary` to build the final artifact and run-page annotation.
- **`scripts/mutation/run-diff.ts`** — Calls `overlayReport` after a local diff-based mutation run to fold the partial result into the already-downloaded sweep report.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — Unit tests for `mergeReports`, `overlayReport`, `incompleteFiles`, `renderHtml`, and `formatSummary`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Exercises `spanOf` and shard-wave planning whose output feeds `incompleteFiles` and `mergeReports`.

## Notes

- **Mutant ids are per-report.** Stryker numbers mutants independently in each shard, so all ids are renumbered sequentially in the merged output. `coveredBy`/`killedBy` test-id lists are remapped through `mergeTests`' `remap` helper.
- **First report wins at slice edges.** A mutant on a slice boundary appears in both neighbours' reports; the earlier shard's result is authoritative.
- **Incomplete files are dropped, not scored.** If any line range of a scope file was never covered by a finished shard, the entire file is excluded from the merged report so the ratchet records nothing for it.
- **`config` is stripped.** The top-level `config` field names only one shard's `--mutate` list and is removed from the merged report.
- **HTML rendering is fragile by design.** `renderHtml` depends on the literal string `app.report =` surviving in Stryker's `index.html`. A Stryker upgrade that changes that line will throw a descriptive error.
- **`overlayReport` ordering.** The partial run is placed first in the test-merge so that shared tests keep their newer (partial) entry; whole-report files are kept only for paths absent from the partial.
