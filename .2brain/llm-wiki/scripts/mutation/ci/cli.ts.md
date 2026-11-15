---
source: scripts/mutation/ci/cli.ts
sha256: a4f5e3dcb713343793a2606b828332b2ca33583c02c640c554ad81812df16880
generated_at: 2026-11-14T17:37:01.625103+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/cli.ts

## Purpose

CLI entry point for the GitHub Actions mutation-testing sweep. Each step in `mutation.yml` and `mutation-wave.yml` invokes exactly one subcommand (`config`, `wave`, `shard`, `outcome`, `merge`); the planning, slicing, and merging logic lives in the sibling pure modules (`waves.ts`, `merge.ts`). This file handles argument parsing, file I/O, and GitHub Actions output plumbing only.

## Key elements

- **`commands`** — dispatch table mapping subcommand name → handler; unknown/missing subcommand exits 2 with usage text.
- **`writeConfig`** — reads `stryker.json`, appends the `SLICE_PLUGIN` and `ci-slice` ignorer, writes the result to `tmp/stryker.ci.json`.
- **`scope()`** — returns the mutable file list (from `mutate-scope`) annotated with logical and physical line counts for the wave planner.
- **`planWave`** — calls `firstWave` or `nextWave` (from `waves.ts`) and writes the `WavePlan` JSON; emits `shards` (name array) and `count` to stdout for the GitHub matrix.
- **`showShard`** — looks up one shard in a plan file and prints its `--mutate` list and `MUTATION_SLICE` value to stdout.
- **`recordOutcome`** — writes a `{ name, status }` JSON file for the shard so the next wave's planner can see which shards succeeded or failed.
- **`merge`** — reads all wave plans and finished shard reports, calls `mergeReports` / `renderHtml` / `formatSummary` (from `merge.ts`), and writes the combined `mutation.json`, `index.html`, and `summary.md`.
- **`option(name)`** — required `--name=value` extractor; throws if missing.
- **`output(key, value)`** — prints a `key=value` line to stdout (consumed by `>> "$GITHUB_OUTPUT"`).
- **`readJson` / `writeOut`** — thin JSON-file helpers; `writeOut` creates parent directories.
- **`readOutcomes` / `readFinished`** — directory-scanning helpers that build maps of shard outcomes and paired shard+report entries.
- Constants: `CI_CONFIG_PATH`, `SLICE_PLUGIN`, `WEAKEST_SHOWN` (15).

## Relationships

- **`github/workflows/mutation.yml` / `mutation-wave.yml`** — the callers; each workflow step runs one subcommand of this file.
- **`scripts/cli.ts`** — provides `flagValue`, the shared `--key=value` argument parser.
- **`scripts/mutation/ci/waves.ts`** — supplies `firstWave`, `nextWave`, `outcomeOf`, `strykerArguments`, and the `WavePlan` / `ShardOutcome` types.
- **`scripts/mutation/ci/merge.ts`** — supplies `mergeReports`, `renderHtml`, `formatSummary`, and the `ShardReport` / `StrykerReport` types.
- **`scripts/mutation/baseline.ts`** — supplies `REPORT_PATH` (where Stryker writes its report) and `scoresFromReport`.
- **`scripts/mutation/mutate-scope.ts`** — supplies `mutableFiles` and `lineCount`.

## Notes

- **stdout vs. stderr split:** every `console.log` call is a `key=value` line meant for `$GITHUB_OUTPUT`; all human-readable diagnostics go to `console.error`. Mixing them breaks the workflow.
- **CI-only:** this file is not imported by `npm run mutation:full`, which keeps its own `stryker.json` run without the slicing plugin.
- **Config is ephemeral:** `tmp/stryker.ci.json` is derived on every job and is gitignored; it never drifts from the committed `stryker.json`.
- **Trust-based deserialization:** `readJson` returns `unknown` and callers cast immediately. Files are assumed to have been written by this same pipeline or Stryker's reporter—no runtime shape validation.
- **`SLICE_PLUGIN` path** is relative to the repo root where Stryker executes, not relative to this script.
