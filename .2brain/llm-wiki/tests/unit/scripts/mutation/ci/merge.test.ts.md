---
source: tests/unit/scripts/mutation/ci/merge.test.ts
sha256: 85ad82cec925229c11af3262dcc3caf4bf1f8998cd7c92a1fd74abefe5ba8d16
generated_at: 2026-11-08T10:38:23.832308+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/ci/merge.test.ts

## Purpose

Unit tests for the shard-report merging pipeline in `scripts/mutation/ci/merge.ts`. Verifies that GitHub-sweep shard reports are correctly folded into a single Stryker report, that incomplete files are detected and excluded, that test IDs are disambiguated across shards, and that the final HTML summary is rendered safely.

## Key elements

- **Fixtures** (`FILE`, `SCOPE`, `slice`, `shard`, `mutant`, `report`, `halves`) — hand-built, minimal Stryker-shaped data; `halves()` produces two shard reports covering lines 1–20 and 21–40 of a single file.
- **`describe('incompleteFiles')`** — asserts gap detection: a file is complete only when its slices (in any order) cover the full unit; gaps or empty shard lists flag the file.
- **`describe('mergeReports')`** — asserts mutant deduplication (first shard wins for edge mutants), test-ID re-keying when two shards reuse the same numeric ID, exclusion of partially-covered files, and removal of the per-shard `config` block.
- **`describe('overlayReport')`** — asserts that files measured by the partial run override the whole, other files pass through unchanged, test IDs are re-keyed per source report, and mutant IDs remain globally unique.
- **`describe('renderHtml')`** — asserts the report JSON is injected into Stryker's `<script>` template with HTML-escaping (specifically `</script>` → `<"+"/script>"`), and that a missing `app.report` anchor causes a throw.
- **`describe('tally and formatSummary')`** — asserts scoring treats `Timeout` as killed, excludes `Ignored`, and that `formatSummary` lists incomplete files with a "no finished shard" message.

## Relationships

- **`scripts/mutation/ci/merge.ts`** — the system under test; all six exported functions (`incompleteFiles`, `mergeReports`, `overlayReport`, `renderHtml`, `tally`, `formatSummary`) and types (`ShardReport`, `StrykerReport`) are imported here.
- **`scripts/mutation/ci/slice-ignorer.ts`** — supplies `SLICE_IGNORE_REASON`, used to tag slice-ignored mutants in fixtures so merge logic can recognize them.
- **`scripts/mutation/ci/waves.ts`** — supplies the `CiShard`, `ScopeFile`, and `Unit` types that shape the fixture data passed to the merge functions.

## Notes

- Stryker assigns test IDs per-run (starting at 0), so two shards can both have a test `"0"` that refers to different tests. Several tests specifically guard against this ID collision.
- The `renderHtml` test encodes Stryker's exact escaping convention (`<` → `<"+"/`); if Stryker changes its page template the test throws rather than silently producing broken HTML.
- `tally` counts `Timeout` mutants as killed (matching the ratchet's scoring), not as survived or no-coverage.
- Fixtures are intentionally minimal (one file, one test file) to keep failure messages readable; real reports have many more entries.
