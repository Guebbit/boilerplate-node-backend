---
source: tests/unit/scripts/mutation/github-artifacts.test.ts
sha256: 573d2448b38a37d83e0b10ea2b4acba27982020ef271269a5ad0c769f1034abe
generated_at: 2026-11-08T10:38:56.878138+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/github-artifacts.test.ts

## Purpose

Unit tests for the `newestReport` selector in `scripts/mutation/github-artifacts.ts`. Verifies which uploaded mutation-report artifact `npm run mutation:pull` will pick, using synthetic artifact lists rather than live GitHub calls.

## Key elements

- **`artifact(runId, createdAt, overrides)`** — local helper that builds a well-formed `GitHubArtifact` object. Defaults `name` to `REPORT_ARTIFACT`, `expired` to `false`, and `head_branch` to `'main'`; any field can be overridden per case.
- **`describe('newestReport')`** — five cases covering:
  - Picks the most recent `created_at` regardless of list order.
  - Skips artifacts flagged `expired: true` (unavailable for download).
  - Skips artifacts from a non-`main` branch (scores belong to that branch).
  - Skips artifacts whose `name` differs from `REPORT_ARTIFACT` (e.g. the diff job's partial report).
  - Returns `undefined` when the list is empty.

## Relationships

- **`scripts/mutation/github-artifacts.ts`** (tested module) — imports the `GitHubArtifact` type, the `REPORT_ARTIFACT` constant, and the `newestReport` function under test.

## Notes

- The test file intentionally never calls GitHub or `scripts/mutation/pull-report.ts`; it isolates the selection logic by feeding synthetic arrays.
- `overrides` accepts a `branch` key that maps to `workflow_run.head_branch` — a convenience not present on the real `GitHubArtifact` shape, so the helper signature extends `Partial<Omit<GitHubArtifact, 'workflow_run'>>` with that extra field.
