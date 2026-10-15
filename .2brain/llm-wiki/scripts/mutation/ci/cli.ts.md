---
source: scripts/mutation/ci/cli.ts
sha256: 8c76d943ec2b9e7383d72dfd9837603226fcec65b3873e456fe4270b62241c99
generated_at: 2026-10-15T09:42:38.724871+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/cli.ts

## Purpose

Command-line entry point for the GitHub Actions mutation workflow (`mutation.yml`, `mutation-wave.yml`). Each workflow step invokes exactly one subcommand (`config`, `wave`, `shard`, `outcome`, `merge`); the file handles argument parsing, file I/O, and orchestration while delegating all planning/merging/scoring logic to the pure modules that live alongside it. CI-only — not used by `npm run mutation:full`.

## Key elements

- **`commands` map** — dispatch table: subcommand name → handler function (`writeConfig`, `planWave`, `showShard`, `recordOutcome`, `merge`).
- **`option(name)`** — wraps `flagValue` from `scripts/cli.ts`; throws if the `--name=value` argument is missing.
- **`output(key, value)`** — prints a `key=value` line to stdout for `>> "$GITHUB_OUTPUT"` in the workflow.
- **`writeConfig()`** — reads the repo-root `stryker.json`, appends the slicing plugin and `ci-slice` ignorer, and writes the result to `tmp/stryker.ci.json`.
- **`scope()`** — calls `mutableFiles()` and `lineCount()` (from `mutate-scope.ts`) to produce the file list with logical and physical line counts that the wave planner needs.
- **`planWave()`** — calls `firstWave` or `nextWave` (from `waves.ts`) depending on wave number; writes the plan JSON and emits `shards` / `count` for the GitHub matrix.
- **`showShard()`** — resolves a named shard from a plan and prints its `mutate` list and `slice` range (via `strykerArguments` from `waves.ts`).
- **`recordOutcome()`** — maps an exit code + report existence to a `ShardOutcome` (via `outcomeOf`) and persists it as `<name>.json`.
- **`merge()`** — collects all wave plans and shard reports, calls `mergeReports` / `renderHtml` / `formatSummary` (from `merge.ts`) and `scoresFromReport` (from `baseline.ts`), then writes `mutation.json`, `index.html`, and `summary.md`.
- **`readFinished()`** — pairs each shard's Stryker JSON report with its plan entry, in sorted shard-name order.
- **`readJson` / `writeOut`** — small I/O helpers; `writeOut` creates parent directories.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/cli.ts` | Imports `flagValue` for parsing `--name=value` arguments. |
| `scripts/mutation/baseline.ts` | Imports `REPORT_PATH` (expected Stryker report location) and `scoresFromReport` (per-file scores for the summary). |
| `scripts/mutation/mutate-scope.ts` | Imports `mutableFiles` and `lineCount` to build the planning scope. |
| `scripts/mutation/ci/waves.ts` | Imports `firstWave`, `nextWave`, `outcomeOf`, `strykerArguments`, and the `WavePlan` / `ShardOutcome` types. |
| `scripts/mutation/ci/merge.ts` | Imports `mergeReports`, `renderHtml`, `formatSummary`, and the `ShardReport` / `StrykerReport` types. |

## Notes

- **stdout vs stderr split:** stdout carries only `key=value` lines for `$GITHUB_OUTPUT`; all human-readable logging goes to stderr. Mixing the two would corrupt the workflow variable.
- **`tmp/stryker.ci.json`** is derived at runtime and gitignored — it is never committed, so it cannot drift from the base `stryker.json`.
- **`readJson` does no validation.** The comment makes the contract explicit: every JSON file read was written by this same pipeline or Stryker's reporter, so shape is trusted by construction.
- **Unknown subcommand → exit code 2** (conventional "usage error"), with a one-line usage message on stderr.
- **`WEAKEST_SHOWN` (15)** caps how many low-scoring files appear in `summary.md`.
- The slicing plugin path (`SLICE_PLUGIN`) is relative to the repo root because Stryker runs there; it is added via `appendPlugins` rather than replacing the base config.
