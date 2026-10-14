---
source: scripts/mutation/run-diff.ts
sha256: 3c3667ed4fd2dd85e3f787b7bffb7f1406ba1f6a653667d5aff6837a555714a3
generated_at: 2026-10-14T07:20:47.405095+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-diff.ts

## Purpose

Runs Stryker mutation testing scoped to the files a branch changed (versus a base ref, default `origin/main`), then grades the result with the per-file ratchet. Exists to give reviewers a fast, actionable mutation score for their diff in minutes, as opposed to the weekly full sweep which takes longer.

## Key elements

- **`baseArgument` / `base`** — Parses `--base=<ref>` from `process.argv`; falls back to `origin/main`.
- **`changedFiles(baseCommit)`** — Runs `git diff --name-only --diff-filter=ACMR` between the merge base and `HEAD`; returns every touched file (added, copied, modified, renamed).
- **`baseCommit`** — Resolved via `mergeBase(base, 'mutation-diff')`. If `undefined`, the script exits `0` immediately.
- **`files`** — Intersection of `changedFiles` with the project's mutable scope (via `changedMutable` / `mutableFiles`). If empty, exits `0`.
- **`grade()`** — Spawns `npx tsx scripts/mutation/check-baseline.ts` (the per-file ratchet) and returns its exit code. Stryker's own non-zero exit is deliberately ignored.
- **`runStryker(...)`** — Invoked with `--mutate <files joined by comma>` and `--force`. On completion, exits with `1` if OOM-aborted, otherwise with `grade()`.

## Relationships

- **`scripts/git-base.ts`** — Imports `REPO_ROOT` (used as `cwd` for git and Stryker child processes) and `mergeBase` (resolves the actual commit to diff against).
- **`scripts/mutation/mutate-scope.ts`** — Imports `mutableFiles` (the set of files in mutation scope) and `changedMutable` (filters the raw diff list down to mutable files).
- **`scripts/mutation/stryker-run.ts`** — Imports `runStryker`, the shared Stryker launcher that applies the project's per-worker heap cap and concurrency settings. The final grading step shells out to `scripts/mutation/check-baseline.ts` (not in the neighbor list) for the ratchet verdict.

## Notes

- **Whole-file mutation, not line-range.** Stryker supports `--mutate '<path>.ts:10-40'`, but this script passes full paths so scores stay comparable to `mutation-baseline.json`. The design intent: touch a file, you own its mutation debt not regressing.
- **Never records.** `--update` is never forwarded to Stryker, and `check-baseline.ts` independently refuses a partial baseline update. Only the weekly full sweep owns the baseline.
- **Stryker's `thresholds.break` is bypassed on purpose.** A percentage over a handful of mutants is noise; the per-file ratchet is the sole verdict.
- **Must go through `runStryker`.** A bare `npx stryker` invocation would skip the per-worker heap cap and concurrency settings (see `docs/tools/mutation-testing.md#worker-heap-cap`).
