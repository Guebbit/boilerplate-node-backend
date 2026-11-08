---
source: scripts/mutation/github-artifacts.ts
sha256: df94cc9af296faaa3106293eeb10f00e4d53436775aaa37a3cda317a679bc989
generated_at: 2026-11-08T02:53:31.996226+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/github-artifacts.ts

## Purpose

Pure module that defines *which* `mutation-report` GitHub artifact the sweep's merge job uploads and provides the selection logic for picking the newest downloadable one. It contains no I/O or network calls—`pull-report.ts` performs the actual GitHub API requests and file writes using the exports from this file.

## Key elements

- **`REPORT_ARTIFACT`** (exported `const`) — the artifact name (`'mutation-report'`) that `npm run mutation:pull` targets when downloading.
- **`REPORT_BRANCH`** (internal `const`) — hardcoded to `'main'`; the only branch whose sweep reports are considered valid for this checkout.
- **`GitHubArtifact`** (exported interface) — a structural subset of GitHub's "list artifacts" response, narrowing to just `name`, `expired`, `created_at`, and the nested `workflow_run` (`id`, `head_branch`) fields actually read here.
- **`newestReport(artifacts)`** (exported function) — filters to non-expired artifacts on `REPORT_BRANCH` with the correct name, sorts by `created_at` descending, and returns the first (or `undefined`).

## Relationships

- **`github/workflows/mutation.yml`** — the sweep's merge job uploads the artifact named `REPORT_ARTIFACT`; this file documents/encodes that contract.
- **`scripts/mutation/pull-report.ts`** — the caller. It fetches the artifact list from the GitHub API, passes the array to `newestReport`, then uses the returned `workflow_run.id` with `gh run download`.
- **`tests/unit/scripts/mutation/github-artifacts.test.ts`** — unit tests exercising `newestReport` (ordering, expiry, branch filtering, empty input).

## Notes

- `REPORT_BRANCH` is intentionally hardcoded to `'main'` and is **not** exported. Changing the target branch means editing this file, not the caller.
- The module is side-effect-free by design (the doc comment calls it "Pure"). Do not add `fetch`, `fs`, or `child_process` here; those belong in `pull-report.ts`.
- `newestReport` uses `.toSorted` (non-mutating) rather than `.sort`, so the caller's array is left untouched.
