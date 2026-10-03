---
source: scripts/mutation/ci/merge.ts
sha256: 7d4499966228b4747b2307ef2c180d50109ec7339b3b357665047099d0cd72af
generated_at: 2026-10-01T12:32:34.362471+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/merge.ts

## Purpose
Folds Stryker mutation-test reports from multiple CI shards into a single unified report — one HTML page, one `mutation.json` for the ratchet baseline, and one GitHub-flavoured Markdown summary. It resolves slice-ignored mutants, re-keys per-report test IDs, detects files no finished shard covered, and renders the final artifacts.

## Key elements

- **`StrykerReport`** — the subset of Stryker's `mutation-testing-report-schema` this module reads/writes (`files`, `testFiles`, and pass-through fields).
- **`ShardReport`** — one finished shard: its `CiShard` plan entry plus its `StrykerReport`.
- **`MergeResult`** — the merged `StrykerReport` and the list of `incomplete` scope files.
- **`incompleteFiles(scope, finished)`** — returns scope files whose line ranges were not fully covered by any finished shard's units (judged by line spans, not report contents).
- **`mergeReports(finished, scope)`** — the main merge: collects mutants per file (first non-ignored report wins), re-keys test IDs to a canonical numbering, drops incomplete files, strips shard-specific `config`, and returns a `MergeResult`.
- **`renderHtml(template, report)`** — swaps the `app.report = …` line in a shard's Stryker-generated `index.html` with the merged JSON; throws if the marker line is missing.
- **`formatSummary({ report, incomplete, weakest })`** — produces the GitHub Markdown summary block (score, per-status table, weakest files, incomplete list).
- **`tally(report)`** — counts mutants by status and computes the ratchet score (`(Killed + Timeout) / valid × 100`).
- **`mutantKey`** (internal) — stable identity for a mutant across slices: `mutatorName|replacement|start-end` location.
- **`skippedBySlice`** (internal) — true when a mutant is `Ignored` with `SLICE_IGNORE_REASON`.
- **`mergeTests`** (internal) — deduplicates tests across reports into one list per test file, keyed by `file|name|line`, and returns per-report ID maps for remapping `coveredBy`/`killedBy`.

## Relationships

- **`scripts/mutation/ci/slice-ignorer.ts`** — provides the `SLICE_IGNORE_REASON` constant used to identify mutants that were not actually run in a given shard.
- **`scripts/mutation/ci/waves.ts`** — provides the `CiShard`, `ScopeFile` types and the `spanOf` helper; `incompleteFiles` relies on `spanOf` to compute line coverage.
- **`scripts/mutation/ci/cli.ts`** — the CI CLI entry point that orchestrates the sweep and calls `mergeReports`, `renderHtml`, and `formatSummary` to produce the final artifacts.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — unit tests exercising the merge, incomplete-detection, HTML rendering, and summary formatting logic.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — tests the `waves` module whose types (`CiShard`, `ScopeFile`) and `spanOf` function this file depends on.

## Notes

- **First-report-wins for edge nodes:** a mutant that crosses a slice boundary appears in both neighbours' reports; the first report in the `finished` array is authoritative. The `finished` order must therefore be stable and meaningful.
- **Incomplete files are dropped entirely**, not given a partial score — the ratchet keeps its old baseline for them. A file is also dropped if any mutant in it was skipped by every slice (`ran.size < seen.size`).
- **Test IDs are not stable across shards.** Stryker numbers them per report, so `mergeTests` re-keys by `file|name|startLine` and `mergeReports` remaps `coveredBy`/`killedBy` arrays through the per-report ID maps.
- **`config` is stripped** from the top-level merged report because it encodes only one shard's `--mutate` glob list.
- **`renderHtml` is fragile:** it searches for a line starting with `app.report = ` and splices JSON into it. A Stryker version bump that changes the viewer layout will cause a thrown error.
- **JSON escaping in `renderHtml`** uses Stryker's own `<` → `'<+"` substitution to prevent a `<` inside the JSON string from closing the surrounding `<script>` tag.
- **Mutant identity** (`mutantKey`) deliberately excludes the `id` field, which is per-report and not comparable across shards.
