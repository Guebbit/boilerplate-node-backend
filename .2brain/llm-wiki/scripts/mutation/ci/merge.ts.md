---
source: scripts/mutation/ci/merge.ts
source_sha256: 36e33803b5e61e6a33f9c9da98c89483d8479c9142e76c404b9c99e21b4f8a32
context_sha256: 55b454f24a8ba936c361222ccf959328d5f6f3116bdf4be4200aff49bcfaaf1f
generated_at: 2026-11-22T02:08:25.239145+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/ci/merge.ts

## Purpose
Folds the Stryker reports from every shard of a GitHub mutation sweep into one report (one HTML page, one JSON report for the ratchet, one run-page summary). It also overlays a local partial run onto a whole report, so the single report on disk stays complete after a diff run.

## Key elements
- `StrykerReport`, `ShardReport`, `MergeResult`: types for the subset of Stryker's report schema it reads and writes, a finished shard (plan entry plus report), and the merge output (`report` plus `incomplete` file list).
- `incompleteFiles(scope, finished)`: returns scope files whose physical lines are not fully covered by the finished shards' unit line spans. It judges by line ranges because Stryker omits files with no mutants, so "absent" does not mean "failed".
- `mergeReports(finished, scope)`: the main merge.
  - Each mutant takes the result of the first report that actually ran it. Mutants marked `SLICE_IGNORE_REASON` are skipped, and the first report wins for edge nodes.
  - Mutants are matched across slices by `mutatorName|replacement|location`.
  - Ids are renumbered.
  - Files that are incomplete, or that have a mutant no report ran, are left out of the merged report.
  - The top level is taken from the first report, minus `config`.
- `mergeTests` (internal): re-keys tests across reports by file, name and start line, and returns a `remap` for `coveredBy` and `killedBy` ids. Stryker numbers test ids per report.
- `overlayReport(whole, partial)`: files the partial run measured take its result. All other files keep the whole report's. Tests and mutants are renumbered, and the partial run's tests take precedence.
- `renderHtml(template, report)`: replaces the `app.report = …` line of a shard's `index.html` with the merged JSON, escaping `<` the way Stryker does. It throws if that line is missing.
- `formatSummary(...)`: builds the run page's GitHub-flavoured Markdown summary. It takes `report`, `incomplete` and `weakest` (per-file scores, lowest first). Its body is beyond what is shown here.

## Relationships
- `./slice-ignorer`: supplies `SLICE_IGNORE_REASON`, which identifies mutants that another slice's report ran.
- `./waves`: supplies the `CiShard` and `ScopeFile` types and `spanOf`, used to compute line coverage per unit.
- `tests/unit/scripts/mutation/ci/merge.test.ts`: unit tests for this module.
- `cli.ts` and `run-diff.ts` are graph neighbors. By the module doc, the overlay is what `npm run mutation` does after a diff run, and the merge is for the GitHub sweep. The call sites are not visible in the shown content.

## Notes
- Pass `finished` in a stable order, because the first report wins an edge node.
- Leaving incomplete files out is deliberate, so the ratchet records nothing for a file rather than a partial score.
- `renderHtml` depends on Stryker's HTML template layout, so a Stryker upgrade could break it.
