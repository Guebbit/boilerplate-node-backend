---
source: scripts/mutation/github-artifacts.ts
source_sha256: 20fcd8261ee7f08a3cbadb7a4d2148d1884a3f12f5d422da3efe82084bd646ca
context_sha256: b53b7f70b725db43732cdc6da2cb2907ebce8f404ad03c9367c4aaaf7f51246e
generated_at: 2026-11-22T02:09:12.387996+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/github-artifacts.ts

## Purpose
Decides which `mutation-report` artifact `npm run mutation:pull` should download. It is a pure selection module: `pull-report.ts` makes the GitHub calls and writes the files, and this file only picks an artifact from a list or says why none qualifies.

## Key elements
- `REPORT_ARTIFACT` (exported): the artifact name `'mutation-report'`. The sweep's merge job uploads it, and it holds the merged mutation report data and its `index.html`.
- `REPORT_BRANCH` (private): `'main'`. Only reports measured on this branch are accepted.
- `GitHubArtifact` (interface): the subset of fields read from GitHub's "list artifacts for a repository" response: `name`, `expired`, `created_at`, and `workflow_run.id` / `workflow_run.head_branch`.
- `MissingReason`: `'none-uploaded' | 'none-from-main' | 'all-expired'`.
- `NewestReport`: either `{ artifact }` or `{ missing: MissingReason }`.
- `newestReport(artifacts)`: filters the list in three steps and returns the result.
  1. Keep artifacts named `REPORT_ARTIFACT`. If none remain, return `none-uploaded`.
  2. Keep those whose `workflow_run.head_branch` is `main`. If none remain, return `none-from-main`.
  3. Drop expired ones and take the newest by `created_at`. If none remain, return `all-expired`.

## Relationships
- `scripts/mutation/pull-report.ts` is the consumer. Per the module doc, it performs the GitHub calls and file writes. This module supplies the choice of artifact, including the run id that `gh run download` takes.
- `tests/unit/scripts/mutation/github-artifacts.test.ts` is the unit test for this module. It is practical to test because the module is pure.

## Notes
- The returned `missing` reason is the first rule that emptied the list, so the check order matters.
- Reports from other branches are skipped on purpose. They measure that branch's code rather than `main`'s.
- Expired artifacts still appear in GitHub's list but can't be downloaded. They count toward `none-from-main` being ruled out, and a `main` list made up only of expired artifacts returns `all-expired`.
- Input order doesn't matter. The newest artifact is chosen by comparing `created_at` strings with `localeCompare`, which suits ISO-8601 timestamps.
- The function uses `toSorted` and `.at(0)`, which are ES2023 features.
