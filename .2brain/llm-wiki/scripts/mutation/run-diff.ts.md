---
source: scripts/mutation/run-diff.ts
sha256: 3aa06415ea10ee180a03b07be4759ac11b00a912d947652baacdf81475899569
generated_at: 2026-09-27T13:56:57.098299+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-diff.ts

## Purpose

Runs Stryker mutation testing scoped to the files a branch changed (default base: `origin/main`), then grades the result against the per-file baseline ratchet. Exists to give reviewers a fast, actionable mutation score in minutes rather than waiting for the weekly full sweep.

## Key elements

- **`changedFiles(baseCommit)`** — shells out to `git diff --name-only --diff-filter=ACMR <base>...HEAD` to list all added, copied, modified, or renamed files in the branch.
- **`base`** — resolved from `--base=` CLI argument or defaults to `origin/main`.
- **`baseCommit`** — obtained from `mergeBase(base, 'mutation-diff')`; if undefined the script exits 0 immediately.
- **`files`** — the intersection of `changedFiles` and the project's mutable-file set (via `changedMutable`). If empty, the script prints a message and exits 0.
- **`grade()`** — spawns `scripts/mutation/check-baseline.ts` (the per-file ratchet) and returns its exit code. Stryker's own non-zero exit (from `thresholds.break`) is deliberately discarded.
- **Main execution block** — calls `runStryker` with `--mutate <files>` (whole-file scope) and `--force`; on completion exits with `1` if OOM-aborted, otherwise with `grade()`.

## Relationships

- **`scripts/git-base.ts`** — provides `REPO_ROOT` (used as `cwd` for git and child processes) and `mergeBase` (resolves the actual merge-base commit to diff against).
- **`scripts/mutation/mutate-scope.ts`** — provides `mutableFiles()` (the canonical list of files eligible for mutation) and `changedMutable()` (filters the raw diff list down to those that are actually mutable).
- **`scripts/mutation/stryker-run.ts`** — provides `runStryker`, the shared wrapper that sets per-worker heap caps and concurrency. The script routes through it rather than calling `npx stryker` directly to inherit those settings.

## Notes

- **Never records.** `--update` is intentionally not forwarded to Stryker; only the weekly full sweep owns `mutation-baseline.json`.
- **Whole-file, not line-range.** Deliberate choice so scores remain comparable to what `mutation-baseline.json` stores.
- **Stryker's `thresholds.break` is bypassed** at the grading step. The ratchet (per-file, baseline-relative) is the sole verdict.
- **`--force`** is passed to Stryker to overwrite any prior report so the ratchet reads the correct data.
- **Exit-code contract:** 0 = no mutable files changed, no base commit, or ratchet passed; 1 = OOM abort; non-zero = ratchet failed (a file's score dropped below its recorded baseline).
