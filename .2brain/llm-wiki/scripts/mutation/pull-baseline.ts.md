---
source: scripts/mutation/pull-baseline.ts
sha256: e7f5f8a744a2bd2a36c9259db05dc9c92f0ceb17b305786077bd1c7853fcf487
generated_at: 2026-10-15T09:43:03.096830+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/pull-baseline.ts

## Purpose

Downloads the most recent mutation-testing baseline that the GitHub sweep uploaded as a run artifact, then overwrites the local `mutation-baseline.json`. It exists because the sweep runs without write access to the repository, so it cannot commit the baseline directly — this script "brings it home" for a human (or CI) to review and commit.

## Key elements

- **`run`** — promisified `child_process.execFile`; all CLI invocations go through this (arguments are a list, never a shell string).
- **`listArtifacts()`** — calls `gh api repos/{owner}/{repo}/actions/artifacts?name=…&per_page=100` and returns the parsed `GitHubArtifact[]` for the named baseline artifact.
- **`download(runId, directory)`** — calls `gh run download <runId> --name <artifact> --dir <directory>` to fetch and unzip one artifact into a local path.
- **`install(artifact)`** — orchestrates the round-trip: creates a `mkdtemp` scratch dir → `download` into it → `copyFile` the baseline out to `BASELINE_PATH` → removes the scratch dir → logs a `[mutation-pull]` line with the source run ID and timestamp.
- **Main flow (bottom)** — `listArtifacts` → `newestBaseline` selection → `install`; on failure prints an error and sets `process.exitCode = 1`.

## Relationships

- **`scripts/mutation/baseline.ts`** — supplies `BASELINE_PATH`, the canonical on-disk location the downloaded file is copied to.
- **`scripts/mutation/github-artifacts.ts`** — supplies the `GitHubArtifact` type, the `BASELINE_ARTIFACT` name constant, and `newestBaseline()` which picks the most recent valid artifact from the list returned by the API.

## Notes

- Requires the GitHub CLI (`gh`) to be installed and authenticated (`gh auth login`); the script has no fallback or HTTP path.
- Overwrites `mutation-baseline.json` in place with no backup — the caller is expected to `git diff` and commit intentionally.
- `per_page=100` is the GitHub API page maximum; the comment notes this covers "months of monthly sweeps."
- The script is invoked as `npm run mutation:pull` (see the shebang: `#!/usr/bin/env tsx`).
- On a successful pull the log line reminds the operator to review via `git diff` before committing.
