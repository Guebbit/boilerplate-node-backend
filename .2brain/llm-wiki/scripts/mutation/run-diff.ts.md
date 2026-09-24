---
source: scripts/mutation/run-diff.ts
sha256: 854f05f2834de1d194992bab866fe8a4348d5994501118ee20522e977cf535d3
generated_at: 2026-09-23T17:28:37.770348+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-diff.ts

## Purpose

Runs a Stryker mutation-testing sweep scoped to the files a branch changed (relative to a base ref), then grades the result against the per-file ratchet in `check-baseline.ts`. It exists to give reviewers a fast, actable mutation score for only the code they touched, without re-measuring the entire codebase.

## Key elements

- **`changedFiles()`** — Shells out to `git diff --name-only --diff-filter=ACMR <merge-base>...HEAD` to list every file the branch touched (added, changed, modified, renamed), unfiltered.
- **`files`** — The intersection of `changedFiles()` and the project's mutable-file set, produced by `changedMutable(changedFiles(), mutableFiles())`. If empty, the script exits 0 immediately.
- **`grade()`** — Spawns `scripts/mutation/check-baseline.ts` via `npx tsx` and returns its exit code. This is the sole verdict; Stryker's own exit status is discarded.
- **Main execution** — Calls `runStryker` with `--mutate <files> --force`, then either exits 1 (OOM abort) or exits with `grade()`.
- **`--base=` CLI arg** — Selects the comparison ref (default `origin/main`). Resolved via `mergeBase` before being passed to git.

## Relationships

- **`scripts/git-base.ts`** — Supplies `REPO_ROOT` (used as `cwd` for both the git call and the ratchet spawn) and `mergeBase` (resolves the `--base` argument into an actual merge-base commit hash).
- **`scripts/mutation/mutate-scope.ts`** — Provides `mutableFiles()` (the set of files eligible for mutation) and `changedMutable()` (filters the git-diff list down to those files).
- **`scripts/mutation/stryker-run.ts`** — Provides `runStryker`, the shared wrapper that applies the project's per-worker heap cap and concurrency settings before invoking Stryker. This script delegates to it rather than calling Stryker directly.
- **`scripts/mutation/check-baseline.ts`** (referenced, not in the import graph) — Executed by `grade()` after the Stryker run completes; performs the per-file ratchet comparison and returns the pass/fail exit code.

## Notes

- **Whole-file mutation, not line-range.** Stryker supports `--mutate 'file.ts:10-40'`, but this script passes entire file paths on purpose so scores are directly comparable to the per-file values stored in `mutation-baseline.json`. A line-range score has no baseline to compare against.
- **Stryker's exit code is ignored.** `runStryker` may exit non-zero because of `thresholds.break` firing on a small sample; `grade()` (the ratchet) is the only signal that determines the script's exit code.
- **`--update` is never forwarded.** Recording a partial (diff-scoped) report as the baseline would wipe scores for every file the run did not measure. The weekly full sweep owns baseline updates.
- **`--force` is passed to Stryker** to prevent it from skipping a run that it thinks is unchanged.
- **OOM path:** if `runStryker` reports `abortedForOom`, the script exits 1 without calling `grade()` at all.
