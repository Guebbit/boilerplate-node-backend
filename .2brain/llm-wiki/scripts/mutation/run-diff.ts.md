---
source: scripts/mutation/run-diff.ts
sha256: b6f5e98161f11e168ead1862a214d98d19a66dd910e0addba691c35e956664b0
generated_at: 2026-10-15T09:43:15.468691+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-diff.ts

## Purpose

Runs Stryker mutation testing scoped to the files changed in the current branch (diffed against `origin/main` or a `--base` ref), then grades the result against the per-file baseline ratchet. It exists to give reviewers a fast, actionable mutation score in minutes rather than waiting for the weekly full sweep.

## Key elements

- **`base`** — Git ref to diff against; read from `--base` flag, defaults to `origin/main`.
- **`changedFiles(baseCommit)`** — Runs `git diff --name-only --diff-filter=ACMR <base>...HEAD` to list added, changed, modified, and renamed files.
- **`baseCommit`** — Merge base between `base` and HEAD, obtained via `mergeBase`. If undefined (git cannot resolve), the script exits 0 immediately.
- **`files`** — Intersection of `changedFiles` and the project's mutable scope, computed by `changedMutable(changedFiles, mutableFiles())`. If empty, exits 0.
- **`grade()`** — Spawns `scripts/mutation/check-baseline.ts` (the ratchet) and returns its exit code. Stryker's own non-zero exit (`thresholds.break`) is deliberately ignored.
- **`runStryker(...)` call** — Executes Stryker with `--mutate <files>` and `--force`. On completion, exits with the ratchet's verdict (or 1 if aborted for OOM).

## Relationships

- **`scripts/cli.ts`** — Imports `flagValue` to parse the `--base` CLI flag.
- **`scripts/git-base.ts`** — Imports `mergeBase` to resolve the fork point between the base ref and HEAD.
- **`scripts/modules-on-disk.ts`** — Imports `REPO_ROOT` as the working directory for all subprocess calls.
- **`scripts/mutation/mutate-scope.ts`** — Imports `changedMutable` (filters changed files to those in mutation scope) and `mutableFiles` (the full mutable file set).
- **`scripts/mutation/stryker-run.ts`** — Imports `runStryker`, which wraps the Stryker invocation with per-worker heap caps and concurrency limits shared across all entry points.

## Notes

- **Whole files, not line ranges.** Stryker supports `--mutate 'file.ts:10-40'`, but this script mutates entire files so scores compare directly against `mutation-baseline.json`, which is recorded per-file.
- **Never updates the baseline.** `--update` is intentionally not forwarded. A partial (diff-scoped) run recorded as the baseline would erase scores for every file it did not measure. The weekly full sweep owns baseline writes.
- **Exits 0 on "nothing to do."** If there is no resolvable merge base or no mutable files changed, the script exits 0 rather than failing—by design, it must not block a caller (e.g., CI) for reasons unrelated to code quality.
- **Stryker's own exit code is discarded.** `thresholds.break` fires on the diff's average percentage, which is noisy for a small set of mutants. The ratchet in `check-baseline.ts` is the sole pass/fail verdict.
