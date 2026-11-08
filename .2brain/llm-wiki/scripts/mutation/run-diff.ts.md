---
source: scripts/mutation/run-diff.ts
sha256: 6b6006cacfc923c184fbd4b8d833e9146bc1ea55beca37c89812dbd4adb5d25d
generated_at: 2026-11-08T02:54:18.358451+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/run-diff.ts

## Purpose

Runs a Stryker mutation pass scoped to the whole files a branch changed relative to a base ref (default `origin/main`), grades that partial run against the per-file ratchet, then overlays the result onto the full report already on disk so the stored report stays whole. It exists so a branch's mutation coverage can be checked in CI or locally without re-running the entire codebase's sweep.

## Key elements

- **`base`** — resolved from `--base` flag or defaults to `origin/main`; the ref the diff is taken against.
- **`changedFiles(baseCommit)`** — shells out to `git diff --name-only --diff-filter=ACMR <base>...HEAD` to list every added/changed/modified/renamed file.
- **`baseCommit`** — result of `mergeBase(base, …)`; if undefined the script exits 0 immediately.
- **`files`** — intersection of `changedFiles` and the project's mutable scope (`changedMutable` / `mutableFiles`); if empty, exits 0.
- **`grade()`** — spawns `scripts/mutation/check-baseline.ts` via `npx tsx`; its exit code is the sole verdict. Stryker's own non-zero exit (thresholds.break) is intentionally ignored.
- **`readStrykerReport(file)`** — reads and parses a Stryker JSON report file.
- **`previous`** — snapshot of the on-disk report and its mtime *before* the Stryker run, used to detect whether Stryker actually wrote a new one.
- **`keepReportWhole()`** — if a previous report existed and the mtime changed, calls `overlayReport` to merge this run's files into it, writes the merged JSON back, and re-renders the HTML page.
- **Main flow** — calls `runStryker` with `--mutate <files> --force`; on completion grades, overlays, then `process.exit(verdict)`. On OOM abort exits 1; on thrown error delegates to `failScript`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/mutation/stryker-run.ts` | Imports `runStryker` to launch Stryker with the project's shared heap-cap and concurrency settings. |
| `scripts/mutation/mutate-scope.ts` | Imports `changedMutable` and `mutableFiles` to filter the diff down to in-scope files. |
| `scripts/mutation/ci/merge.ts` | Imports `overlayReport`, `renderHtml`, and the `StrykerReport` type for the report-merge step. |
| `scripts/mutation/baseline.ts` | Imports `REPORT_PATH` to locate the Stryker JSON and HTML output. |
| `scripts/git-base.ts` | Imports `mergeBase` to resolve the branch-point commit. |
| `scripts/cli.ts` | Imports `flagValue` to read the `--base` CLI flag. |
| `scripts/modules-on-disk.ts` | Imports `REPO_ROOT` for path resolution and `cwd` arguments. |
| `scripts/fail-script.ts` | Imports `failScript` as the `.catch` handler for unhandled rejections. |

## Notes

- **`--update` is never forwarded.** The partial run must not write a new baseline, so a stale or partial report can't erase the existing one.
- **Whole files, not lines.** The `--mutate` argument lists file paths, not line ranges. This is a deliberate simplification; see `docs/tools/mutation-testing.md` for rationale.
- **Exit code is the ratchet's, not Stryker's.** Stryker's `thresholds.break` firing on the diff's average is explicitly suppressed; only `check-baseline.ts` decides pass/fail.
- **Overlay is guarded by mtime.** `keepReportWhole` compares `statSync(reportFile).mtimeMs` against the pre-run snapshot; if Stryker produced no new file (e.g., `--force` produced identical output) the overlay is skipped.
- **Two early-exit paths (exit 0):** no resolvable base commit, or no mutable files in the diff. Both are non-blocking so the caller (CI or `npm run`) proceeds.
- **Stryker is invoked through `runStryker`, not `npx stryker` directly**, to inherit the per-worker heap cap. Bypassing it silently drops that cap.
