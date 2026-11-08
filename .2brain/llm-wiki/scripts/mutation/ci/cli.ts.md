---
source: scripts/mutation/ci/cli.ts
sha256: 8c76d943ec2b9e7383d72dfd9837603226fcec65b3873e456fe4270b62241c99
generated_at: 2026-11-08T02:52:39.433331+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/cli.ts

## Purpose

The command-line entry point for the CI mutation sweep. Each step in `mutation.yml` and `mutation-wave.yml` invokes one subcommand here; the actual planning, slicing, and reporting logic lives in the sibling modules (`waves.ts`, `merge.ts`). This file is CI-only — the local `npm run mutation:full` path does not use it.

## Key elements

- **`commands`** — dispatch table mapping subcommand names (`config`, `wave`, `shard`, `outcome`, `merge`) to handler functions.
- **`writeConfig`** — reads the repo-root `stryker.json`, appends the slicing plugin and `ci-slice` ignorer, writes the result to `tmp/stryker.ci.json`.
- **`scope`** — collects mutable files with both `lineCount` and raw physical line counts for the wave planner.
- **`planWave`** — calls `firstWave` or `nextWave` depending on the `--wave` number; writes the plan JSON and emits shard names to stdout for the GitHub matrix.
- **`showShard`** — looks up a shard by name in a plan and emits its `--mutate` list and line slice.
- **`recordOutcome`** — writes a `{ name, status }` JSON for a shard so the next wave's planner can see it.
- **`merge`** — reads all wave plans and shard reports, calls `mergeReports` + `renderHtml` + `formatSummary`, and writes the consolidated `mutation.json`, `index.html`, and `summary.md`.
- **`option(name)`** — required-argument helper; throws immediately if the flag is absent.
- **`output(key, value)`** — prints a `key=value` line to stdout (captured by `>> "$GITHUB_OUTPUT"`).

## Relationships

- **`github/workflows/mutation.yml`, `github/workflows/mutation-wave.yml`** — invoke this script as the sole command for each CI step (`config`, `wave`, `shard`, `outcome`, `merge`).
- **`scripts/mutation/ci/waves.ts`** — source of `firstWave`, `nextWave`, `outcomeOf`, `strykerArguments`, and the `WavePlan`/`ShardOutcome` types.
- **`scripts/mutation/ci/merge.ts`** — source of `mergeReports`, `renderHtml`, `formatSummary`, and the `ShardReport`/`StrykerReport` types.
- **`scripts/mutation/baseline.ts`** — provides `REPORT_PATH` (Stryker's default output) and `scoresFromReport` used in the merge summary.
- **`scripts/mutation/mutate-scope.ts`** — provides `mutableFiles` and `lineCount` that build the planner's scope.
- **`scripts/cli.ts`** — provides the shared `flagValue` argument-parsing helper.

## Notes

- **stdout is reserved for `$GITHUB_OUTPUT`** (`key=value` lines). All human-readable logging goes to stderr via `console.error`.
- The CI config is written to `tmp/stryker.ci.json` deliberately — it lives under a gitignored directory and outside Stryker's sandbox copy, so it never drifts from the committed `stryker.json`.
- JSON files read at runtime are cast without re-validation; the pipeline trusts its own writers and Stryker's JSON reporter.
- An unknown or missing subcommand exits with code **2** (usage error), distinguishing it from a runtime failure.
