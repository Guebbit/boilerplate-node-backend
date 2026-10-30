---
source: scripts/mutation/run-diff.ts
sha256: 6b6006cacfc923c184fbd4b8d833e9146bc1ea55beca37c89812dbd4adb5d25d
generated_at: 2026-10-29T01:39:23.483823+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-diff.ts

## Purpose

Entry point for `npm run mutation`. Runs a Stryker mutation test scoped to the whole files a branch changed (relative to `origin/main` or a `--base` ref), grades the result against the per-file baseline ratchet, then overlays the partial report onto whatever full-sweep report is already on disk so the report stays whole.

## Key elements

- **`base`** – Git ref to diff against; defaults to `origin/main`, overridable via `--base` CLI flag.
- **`changedFiles(baseCommit)`** – Runs `git diff --name-only --diff-filter=ACMR <base>...HEAD` to list every touched file (added, changed, modified, renamed).
- **`baseCommit`** – Result of `mergeBase(base, …)`; `undefined` when git can't determine it (script exits 0).
- **`files`** – Intersection of changed files and the mutable scope (`changedMutable`); if empty, script exits 0.
- **`grade()`** – Spawns `scripts/mutation/check-baseline.ts` (the per-file ratchet) and returns its exit code. Stryker's own non-zero exit is deliberately ignored.
- **`readStrykerReport(file)`** – Reads and parses a Stryker JSON report from disk.
- **`previous`** – The report on disk *before* this run (if any), captured with its mtime.
- **`keepReportWhole()`** – If a prior report exists and Stryker wrote a new one, calls `overlayReport` to merge, then re-renders `index.html` via `renderHtml`.
- **`runStryker({ … })`** – Final call; passes `--mutate <files> --force`. On OOM abort exits 1; otherwise grades, overlays, and exits with the ratchet's code.

## Relationships

- **`scripts/mutation/baseline.ts`** – Imports `REPORT_PATH` (canonical location of the JSON report on disk).
- **`scripts/mutation/ci/merge.ts`** – Imports `overlayReport`, `renderHtml`, and the `StrykerReport` type for merging partial reports.
- **`scripts/mutation/stryker-run.ts`** – Calls `runStryker` so the run inherits the shared worker heap cap and concurrency settings.
- **`scripts/mutation/mutate-scope.ts`** – Imports `changedMutable` and `mutableFiles` to filter the diff to in-scope files.
- **`scripts/git-base.ts`** – Imports `mergeBase` to resolve the fork-point commit.
- **`scripts/modules-on-disk.ts`** – Imports `REPO_ROOT` for all `cwd` and path operations.
- **`scripts/cli.ts`** – Imports `flagValue` to read `--base` from argv.
- **`scripts/fail-script.ts`** – Imported as the `.catch` handler on the `runStryker` promise.

## Notes

- **`--update` is never forwarded** to `check-baseline.ts`; a partial diff run can refresh scores but can never overwrite or erase the baseline.
- **Stryker's exit code is intentionally discarded.** The ratchet (`check-baseline.ts`) is the sole verdict; Stryker's `thresholds.break` firing on the diff's average is not a failure here.
- **Must go through `runStryker`**, not a bare `npx stryker`. Direct invocation bypasses the per-worker `--max-old-space-size` cap and concurrency limit, which has previously caused silent OOM or incorrect results.
- **Exits 0 (not an error)** in two cases: no resolvable base commit, or zero mutable files in the diff. Both mean "nothing to measure," not a failure.
