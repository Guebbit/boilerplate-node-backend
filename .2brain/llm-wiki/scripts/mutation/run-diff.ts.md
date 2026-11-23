---
source: scripts/mutation/run-diff.ts
source_sha256: cd4a86f4cd723f408118784d64d45ab4b8d04ac35027399d9b4b6585ad139eb6
context_sha256: 64489bbf663863acbac9f5dce071aaf6951a896ecdbfdb73ca66aaf53d3d439c
generated_at: 2026-11-22T02:10:10.809171+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/run-diff.ts

## Purpose
Entry point for `npm run mutation`: runs Stryker mutation testing only on the mutable source files changed on the current branch (whole files, not lines) relative to a base ref, then grades the result with the per-file baseline ratchet. It never records a baseline (`--update` is not forwarded), so a partial run can't erase the stored one.

## Key elements
- `base` — git ref to diff against; `--base=<ref>` flag, default `origin/main`.
- `changedFiles(baseCommit)` — runs `git diff --name-only --diff-filter=ACMR <baseCommit>...HEAD` in `REPO_ROOT` (added, copied, modified, renamed; deletions excluded).
- `baseCommit` — result of `mergeBase(base, 'mutation-diff')`. If `undefined`, the script exits 0 without doing anything.
- `files` — `changedMutable(changedFiles(...), mutableFiles())`: changed files inside the mutation scope. If empty, it logs "nothing to measure" and exits 0.
- `grade()` — spawns `npx tsx scripts/mutation/check-baseline.ts` with inherited stdio and returns its exit code (2 if killed by a signal). This is the verdict. Stryker's own non-zero exit is ignored, since it reflects `thresholds.break` on the diff's average.
- `previous` — the report already at `REPORT_PATH` (and its mtime), if one exists.
- `keepReportWhole()` — overlays this run's report onto `previous` with `overlayReport`, writes the merged JSON, and redraws `index.html` via `renderHtml`. Skipped if there was no earlier report or Stryker wrote no new one.
- Main flow: `runStryker({ label, args: ['stryker.json', '--mutate', <files>, '--force'] })`. If `abortedForOom`, exit 1. Otherwise run `grade()`, then `keepReportWhole()`, then exit with the verdict. Errors go to `failScript`.

## Relationships
- `scripts/git-base.ts` — `mergeBase` resolves the branch point.
- `scripts/mutation/mutate-scope.ts` — `mutableFiles` and `changedMutable` define and filter the scope.
- `scripts/mutation/stryker-run.ts` — `runStryker` runs Stryker with the shared per-worker heap cap and concurrency, and reports `abortedForOom`.
- `scripts/mutation/baseline.ts` — supplies `REPORT_PATH`.
- `scripts/mutation/ci/merge.ts` — supplies `overlayReport`, `renderHtml` and the `StrykerReport` type for merging reports.
- `scripts/modules-on-disk.ts` — supplies `REPO_ROOT`, the working directory for git and the child processes.
- `scripts/cli.ts` — `flagValue` parses `--base`.
- `scripts/fail-script.ts` — `failScript` is the `.catch` handler for the Stryker promise.

## Notes
- The grade runs before the overlay, so the verdict reflects only this branch's files. The overlay afterwards keeps a previously pulled sweep complete.
- Stryker must go through `runStryker`, not a bare `npx stryker`. A direct call previously ran without the heap cap and concurrency settings.
- Top-level code runs on import (it exits early at several points), so this is a script, not a module.
