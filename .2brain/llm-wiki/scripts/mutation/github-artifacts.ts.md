---
source: scripts/mutation/github-artifacts.ts
sha256: df94cc9af296faaa3106293eeb10f00e4d53436775aaa37a3cda317a679bc989
generated_at: 2026-10-29T01:39:01.178343+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/github-artifacts.ts

## Purpose

Pure data module that defines which GitHub Actions artifact the `mutation:pull` sweep should download and provides the filtering logic to pick the newest eligible one. It contains no I/O; `pull-report.ts` performs the actual GitHub API calls and file writes using this module's constants and selector.

## Key elements

- **`REPORT_ARTIFACT`** (exported const) — The artifact name (`'mutation-report'`) that the sweep's merge job uploads.
- **`REPORT_BRANCH`** (module-private const) — `'main'`; the branch whose sweep runs are considered valid candidates.
- **`GitHubArtifact`** (exported interface) — A minimal shape of one artifact from GitHub's "list artifacts for a repository" endpoint, limited to the fields this module reads: `name`, `expired`, `created_at`, and a nested `workflow_run` with `id` and `head_branch`.
- **`newestReport`** (exported function) — Filters an arbitrary list of `GitHubArtifact` values to those matching `REPORT_ARTIFACT`, not expired, and produced by a run on `REPORT_BRANCH`; returns the one with the latest `created_at`, or `undefined`.

## Relationships

- **`scripts/mutation/pull-report.ts`** — Consumer. Imports the constants and `newestReport` to decide which artifact to download after listing artifacts from GitHub.
- **`tests/unit/scripts/mutation/github-artifacts.test.ts`** — Unit tests for `newestReport` (filtering, branch exclusion, expiry, tie-breaking, empty input).

## Notes

- The file is explicitly pure (documented in the module header); no side effects, no network calls.
- `REPORT_BRANCH` is intentionally **not** exported — it is an implementation detail of `newestReport` and not meant for external configuration.
- `newestReport` uses `Array.prototype.toSorted` (non-mutating) rather than `sort`, so the caller's array is left untouched.
- The `GitHubArtifact` interface is a deliberate subset of the full GitHub API response; additional fields returned by the API are simply ignored.
