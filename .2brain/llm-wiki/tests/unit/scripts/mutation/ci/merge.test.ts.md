---
source: tests/unit/scripts/mutation/ci/merge.test.ts
sha256: ddd9c3a485d9be268bada04109188aa1c6ed58a759478e28170b4263699ac737
generated_at: 2026-10-15T13:28:19.365729+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/ci/merge.test.ts

## Purpose

Unit tests for `scripts/mutation/ci/merge.ts`, verifying that the logic which folds multiple Stryker mutation-testing shard reports (produced by a GitHub CI sweep over sliced files) into one coherent report handles deduplication, incomplete-coverage detection, test-ID remapping, HTML injection, and summary formatting correctly.

## Key elements

- **Fixture builders** (`FILE`, `SCOPE`, `slice()`, `shard()`, `mutant()`, `report()`, `halves()`) — hand-constructed Stryker-shaped reports; `halves()` returns two `ShardReport` entries that together cover a 40-line file split at line 20.
- **`describe('incompleteFiles')`** — checks gap detection: a file is "complete" only when its slices (in any order) cover the full range, or when a single unit covers it whole.
- **`describe('mergeReports')`** — the core suite: verifies mutant deduplication (each mutant taken once from the slice that ran it), first-wins on edge-node conflicts, re-keying of colliding test IDs across shards, exclusion of incompletely-covered files, and removal of the shard-local `config` field.
- **`describe('renderHtml')`** — asserts the JSON report is spliced into Stryker's `<script>` template with correct escaping, and that a missing `app.report` marker throws.
- **`describe('tally and formatSummary')`** — confirms the scoring formula (TimeOuts count as killed, Ignored/NoCoverage excluded from the denominator) and that the human-readable summary lists unmeasurable files.

## Relationships

- **`scripts/mutation/ci/merge.ts`** — the module under test; all `describe` blocks exercise its exports (`incompleteFiles`, `mergeReports`, `renderHtml`, `tally`, `formatSummary`) and its types (`ShardReport`, `StrykerReport`).
- **`scripts/mutation/ci/slice-ignorer.ts`** — imported for `SLICE_IGNORE_REASON`, used to tag `Ignored` mutants in fixtures so they match the production marker.
- **`scripts/mutation/ci/waves.ts`** — imported for the `CiShard`, `ScopeFile`, and `Unit` types that shape the fixture objects.

## Notes

- **Test-ID collision is intentional.** Stryker assigns test IDs per run, so the numeric `"0"` in shard A is a *different* test than `"0"` in shard B. The `halves()` fixture and the "re-keys test ids" test exist specifically to cover this remapping.
- **`renderHtml` is brittle by design.** It matches Stryker's exact HTML template string (`app.report = …`). A Stryker version bump that changes the page will make the "fails loudly" test pass *and* the swap test fail; update the template constant if that happens.
- **`config` is always dropped** on merge because it is shard-specific (`mutate: ['only this shard']`); the merged report must not carry any single shard's config.
- Fixtures use `language: 'typescript'` and placeholder source (`'…'`) — they are not valid TypeScript files, only structurally valid Stryker report objects.
