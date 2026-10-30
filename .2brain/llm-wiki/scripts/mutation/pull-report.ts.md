---
source: scripts/mutation/pull-report.ts
sha256: f94964b2de5adeb0eadc72ad46371ca5ef41306a57bd270b4a8f4d82e0342381
generated_at: 2026-10-29T01:39:12.690242+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/pull-report.ts

## Purpose

Pulls the newest mutation-testing report artifact from GitHub Actions, installs its `mutation.json` and `index.html` into the local report directory, and folds them into `mutation-baseline.json`. Exists so a developer can bring a CI sweep's results home and review/commit the baseline diff without re-running the sweep locally.

## Key elements

- **`run`** — promisified `execFile`; all child-process calls go through it (no shell interpolation).
- **`PULLED_FILES`** — `['mutation.json', 'index.html']`; the two files copied out of the artifact. The artifact's `summary.md` is intentionally excluded.
- **`REPORT_DIRECTORY`** — `path.dirname(REPORT_PATH)`; the same directory a local mutation run writes into.
- **`listArtifacts()`** — calls `gh api` to list this repo's artifacts named `REPORT_ARTIFACT` (up to 100).
- **`download(runId, directory)`** — calls `gh run download` to extract one artifact into a temp directory.
- **`install(artifact)`** — orchestrates: `mkdtemp` → `download` → `mkdir` report dir → `copyFile` both pulled files → `rm` temp dir. Logs the source run ID and timestamp.
- **`foldBaseline()`** — runs `npx tsx scripts/mutation/check-baseline.ts --merge --merge-dir=…` via `spawnSync` with `stdio: 'inherit'`. Returns the child's exit code (1 = a file measured below baseline; 2 = spawn failure).
- **Top-level flow** — list → pick newest via `newestReport` → install → fold → print a reminder to `git diff` and commit the baseline. Exits 1 on missing artifact or GitHub unreachability.

## Relationships

- **`scripts/mutation/baseline.ts`** — imports `REPORT_PATH` to derive `REPORT_DIRECTORY`; the pull target mirrors where a local run writes.
- **`scripts/mutation/github-artifacts.ts`** — imports the `GitHubArtifact` type, the `REPORT_ARTIFACT` name constant, and the `newestReport` selector function.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — unit-tests the CI wave logic this script participates in (baseline merge semantics).

## Notes

- `foldBaseline` uses `--merge`, not `--update`, so files the sweep could not measure retain their previously recorded score rather than being zeroed.
- `spawnSync` is used (not async `run`) because the script must propagate the child's exit code into `process.exitCode` and the whole flow is already linear.
- The `100` in the list endpoint is the GitHub API page maximum; the comment notes this covers months of monthly sweeps.
- Requires a logged-in GitHub CLI (`gh auth login`); there is no fallback transport.
