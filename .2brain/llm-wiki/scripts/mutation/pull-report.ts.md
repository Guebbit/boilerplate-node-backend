---
source: scripts/mutation/pull-report.ts
generated_at: 2026-11-22T02:09:52.129930+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/pull-report.ts

## Purpose
Implements `npm run mutation:pull`: downloads the newest GitHub mutation-sweep report artifact from `main`, writes its merged mutation report (`mutation.json`) and HTML page (`index.html`) where a local run would put them, then folds the mutation baseline from that report (as the sweep's merge job does). The report is the single source, so the baseline and report can't disagree. It requires the GitHub CLI to be logged in (`gh auth login`).

## Key elements
- `run` — `promisify(execFile)`; arguments go as a list, never through a shell.
- `REPORT_DIRECTORY` — `dirname(REPORT_PATH)`, the destination for pulled files.
- `PULLED_FILES` — the report and page files taken from the artifact (the artifact's summary file is ignored).
- `listArtifacts()` — runs `gh api repos/{owner}/{repo}/actions/artifacts?name=…&per_page=100` and returns the `artifacts` array.
- `download(runId, directory)` — `gh run download <id> --name <artifact> --dir <dir>`.
- `install(artifact)` — downloads into a temp dir, creates `REPORT_DIRECTORY`, copies the two files, always removes the temp dir, and logs the run id and creation date.
- `foldBaseline()` — runs the baseline check script via `npx tsx` with `--merge` and `--merge-dir=<REPORT_DIRECTORY>` and inherited stdio. It returns the exit code, or 2 if the status is null (killed by a signal).
- `missingMessage(reason, artifacts)` — builds an actionable error for each `MissingReason`: `none-uploaded`, `none-from-main`, or expired artifacts (it reports the newest creation date).
- Top-level promise chain (runs on import/execution): list, pick, install, fold, then print a review hint.

## Relationships
- `./baseline` — supplies `REPORT_PATH`, which determines the local output directory.
- `./github-artifacts` — supplies `REPORT_ARTIFACT` (artifact name), `newestReport` (selects the artifact or returns `{ missing: reason }`), and the `GitHubArtifact` and `MissingReason` types.
- `tests/unit/scripts/mutation/ci/waves.test.ts` — listed as a graph neighbor. The file itself shows no direct interaction.

## Notes
- The process exit code is `foldBaseline()`'s: 1 means the sweep measured a file below its baseline. It is 1 on any listing, download or copy error, and also when no usable artifact exists.
- `--merge` (not `--update`) means a file the sweep couldn't measure keeps its recorded score, and scores are never lowered.
- The script does not commit anything. It prints a hint to review the baseline's diff with `git diff` and then commit it.
- The script has no exports and runs its main flow at module load, so it is meant to be executed, not imported.
- Only the first 100 artifacts are listed (no pagination).
