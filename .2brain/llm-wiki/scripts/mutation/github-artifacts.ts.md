---
source: scripts/mutation/github-artifacts.ts
sha256: 3615db46c499120b3b2a093ede9dbc0d7958a0ba978dc5169a1507efd54bdfe4
generated_at: 2026-11-14T17:37:26.626932+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/github-artifacts.ts

## Purpose

Pure data-selection module for the mutation-testing GitHub sweep. It defines the artifact name to look for and the filtering/sorting logic that picks the newest downloadable `mutation-report` artifact from `main`, delegating all I/O (GitHub API calls, file writes) to `pull-report.ts`.

## Key elements

- **`REPORT_ARTIFACT`** (`const`, exported) — The artifact name (`'mutation-report'`) that the sweep's merge job uploads and `npm run mutation:pull` downloads.
- **`REPORT_BRANCH`** (`const`, private) — The branch (`'main'`) whose sweep runs are eligible; artifacts from other branches are skipped.
- **`GitHubArtifact`** (interface, exported) — Minimal shape of a GitHub "list artifacts" response item: `name`, `expired`, `created_at`, and `workflow_run` (with `id` and `head_branch`).
- **`MissingReason`** (type, exported) — Discriminant explaining *why* no artifact was selected: `'none-uploaded' | 'none-from-main' | 'all-expired'`.
- **`NewestReport`** (type, exported) — Discriminated union: either `{ artifact: GitHubArtifact }` to download or `{ missing: MissingReason }`.
- **`newestReport`** (function, exported) — Filters artifacts by name → branch → non-expired, then sorts by `created_at` descending and returns the first match, or the first failing check as a `MissingReason`.

## Relationships

- **`github/workflows/mutation.yml`** — Produces the artifact named by `REPORT_ARTIFACT`; the merge job in that workflow is the uploader this module looks for.
- **`scripts/mutation/pull-report.ts`** — Consumes `newestReport`, `REPORT_ARTIFACT`, and `GitHubArtifact` to perform the actual `gh run download` call and write the report files locally.
- **`tests/unit/scripts/mutation/github-artifacts.test.ts`** — Unit-tests the filtering/sorting logic of `newestReport`.

## Notes

- The module is intentionally **pure** (no I/O, no network). All side effects live in `pull-report.ts`.
- Sorting uses `Array.prototype.toSorted` (non-mutating), available in Node 20+ / ES2023.
- The `workflow_run.id` field on `GitHubArtifact` is what `gh run download` expects; it is part of the interface here only so the caller can pass it through.
- `MissingReason` values are ordered by elimination priority in `newestReport`; the first rule that yields an empty set is the one reported.
