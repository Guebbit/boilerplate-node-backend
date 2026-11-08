---
source: scripts/mutation/pull-report.ts
sha256: f94964b2de5adeb0eadc72ad46371ca5ef41306a57bd270b4a8f4d82e0342381
generated_at: 2026-11-08T02:54:01.492235+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/pull-report.ts

## Purpose

CLI entry point (`npm run mutation:pull`) that retrieves the most recent mutation-test report artifact from GitHub Actions, copies `mutation.json` and `index.html` into the local report directory, and then folds that report into `mutation-baseline.json` using the same `--merge` command the CI sweep uses. It ensures the local baseline and the CI report can never diverge.

## Key elements

- **`listArtifacts()`** – Calls `gh api` to fetch the 100 most recent artifacts matching `REPORT_ARTIFACT` in the current repo.
- **`download(runId, directory)`** – Calls `gh run download` to extract a named artifact into a target directory.
- **`install(artifact)`** – Creates a temp dir, downloads the artifact, copies `mutation.json` and `index.html` into `REPORT_DIRECTORY`, then deletes the temp dir.
- **`foldBaseline()`** – Spawns `npx tsx scripts/mutation/check-baseline.ts --merge --merge-dir=<report dir>` synchronously; returns the child's exit code (1 = a file measured below baseline, 2 = spawn failure).
- **Main flow** (top-level, no wrapper function) – Picks the newest artifact via `newestReport`, installs it, folds the baseline, and sets `process.exitCode` accordingly.

## Relationships

- **`scripts/mutation/github-artifacts.ts`** – Source of the `GitHubArtifact` type, the `REPORT_ARTIFACT` name constant, and the `newestReport()` selector. This file depends on all three.
- **`scripts/mutation/baseline.ts`** – Provides `REPORT_PATH`; this file derives `REPORT_DIRECTORY` from it so pulled artifacts land exactly where a local run would write them.
- **`github/workflows/mutation.yml`** – The CI workflow that produces the `REPORT_ARTIFACT` this script downloads. It is the producer; this file is the consumer.

## Notes

- Requires `gh` CLI to be installed and authenticated (`gh auth login`); no fallback or HTTP client is used.
- `PULLED_FILES` is hard-coded to `['mutation.json', 'index.html']`; the artifact's `summary.md` is intentionally excluded (it belongs to the CI run page, not the local workspace).
- `foldBaseline` uses `--merge` rather than `--update`: files the sweep could not measure retain their previously recorded baseline score.
- Exit codes: `0` on success, `1` on any failure (no artifact, network error, or baseline regression), `2` if the baseline-check subprocess fails to spawn.
- The script is not a module (no exports); it is a standalone script invoked via the `tsx` shebang and the `mutation:pull` npm script.
