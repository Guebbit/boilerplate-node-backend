---
source: scripts/mutation/pull-report.ts
sha256: f9a235f273ad9d7126fd5c201fbbc6db88d3ba37e58db729da10eea19473c0cb
generated_at: 2026-11-14T17:37:51.098015+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/pull-report.ts

## Purpose

CLI entry point for `npm run mutation:pull`. It fetches the newest mutation-sweep report artifact from GitHub Actions, writes `mutation.json` and `index.html` to the same local directory a local run would use, and then re-derives `mutation-baseline.json` from that report so the local baseline and CI baseline cannot diverge.

## Key elements

- **`listArtifacts()`** — Calls `gh api` to list up to 100 artifacts named `REPORT_ARTIFACT` on the current repository.
- **`download(runId, directory)`** — Calls `gh run download` to unzip one artifact into a target directory.
- **`install(artifact)`** — Downloads the chosen artifact into a `mkdtemp` scratch dir, copies `PULLED_FILES` (`mutation.json`, `index.html`) into `REPORT_DIRECTORY`, then removes the scratch dir.
- **`foldBaseline()`** — Spawns `npx tsx scripts/mutation/check-baseline.ts --merge --merge-dir=…` and returns its exit code (1 signals a below-baseline regression).
- **`missingMessage(reason, artifacts)`** — Produces a specific, actionable error string for each `MissingReason` variant (none uploaded, none from main, all expired).
- **Top-level flow** — `listArtifacts → newestReport → install → foldBaseline`; sets `process.exitCode` to 1 on any failure.

## Relationships

- **`scripts/mutation/baseline.ts`** — Imports `REPORT_PATH` to derive `REPORT_DIRECTORY` (the destination for pulled files).
- **`scripts/mutation/github-artifacts.ts`** — Imports the `GitHubArtifact` / `MissingReason` types, the `REPORT_ARTIFACT` constant, and the `newestReport` selector.
- **`github/workflows/mutation.yml`** — The CI workflow whose merge job uploads the artifact this script downloads; the "pull" counterpart to that sweep.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Covers the CI wave logic that ultimately produces the artifact consumed here; this script is the local consumer of that output.

## Notes

- Requires an authenticated `gh` CLI (`gh auth login`). No token is passed programmatically.
- `summary.md` present in the artifact is deliberately **not** pulled; it is only rendered on the GitHub run page.
- Baseline folding uses `--merge` (not `--update`) so that files the sweep could not measure retain their previously recorded score.
- Exit-code contract: `0` = success, `1` = no artifact / GitHub unreachable / below-baseline regression (propagated from `foldBaseline`).
- `per_page=100` is the GitHub API page-size maximum; the list is assumed to contain at most a few months of monthly sweeps.
