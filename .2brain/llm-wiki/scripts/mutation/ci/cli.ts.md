---
source: scripts/mutation/ci/cli.ts
sha256: 7fb053b32c1aa4daabacd2c9a33673dc780a21721ffd8bc7cd074e1df554ec7f
generated_at: 2026-10-14T07:19:51.778879+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/cli.ts

## Purpose

The command-line entry point for every mutation step in the `mutation.yml` and `mutation-wave.yml` GitHub Actions workflows. It parses a single `--name=value`-style subcommand from `argv`, dispatches to a small handler, and writes `key=value` lines to stdout for `$GITHUB_OUTPUT`. All human-readable logging goes to stderr. The actual planning, slicing, and merge logic lives in the pure modules alongside this file; this file is thin glue.

## Key elements

- **`commands` map** – maps subcommand names (`config`, `wave`, `shard`, `outcome`, `merge`) to their handlers; `argv[2]` selects one. Unknown or missing subcommands exit with code 2.
- **`writeConfig`** – reads the repo-root `stryker.json`, appends the CI slicing plugin (`SLICE_PLUGIN`) and the `ci-slice` ignorer, and writes the result to `tmp/stryker.ci.json` (gitignored).
- **`planWave`** – calls `firstWave` (wave 1) or `nextWave` (subsequent waves) from `./waves`; writes the `WavePlan` JSON to `--out` and emits `shards` / `count` to GitHub output.
- **`showShard`** – looks up a named shard in a `WavePlan` and calls `strykerArguments` to print the `--mutate` glob and line `slice` for that shard.
- **`recordOutcome`** – captures a shard's exit code + report presence into a `ShardOutcome` JSON file for the next wave's planner.
- **`merge`** – collects all `WavePlan` files and per-shard `mutation.json` reports, calls `mergeReports` / `renderHtml` / `formatSummary` from `./merge`, and writes the unified `mutation.json`, `index.html`, and `summary.md`.
- **`option(name)`** – extracts a required `--name=value` from `argv`; throws if missing.
- **`output(key, value)`** – prints `key=value` to stdout for GitHub Actions; all diagnostics go through `console.error`.
- **`readJson` / `writeOut` / `readOutcomes` / `readFinished` / `scope`** – small file-IO and scope helpers shared across subcommands.

## Relationships

- **`scripts/mutation/baseline.ts`** – imports `REPORT_PATH` (default Stryker report location used by `recordOutcome`) and `scoresFromReport` (per-file scores used to build the "weakest files" section of `summary.md`).
- **`scripts/mutation/mutate-scope.ts`** – imports `mutableFiles` and `lineCount` to build the file scope fed into `firstWave`.
- **`scripts/mutation/ci/waves.ts`** – imports `firstWave`, `nextWave`, `outcomeOf`, `strykerArguments`, and the `WavePlan` / `ShardOutcome` types. All wave-planning and shard-slicing logic lives there; this file only orchestrates file I/O around it.
- **`scripts/mutation/ci/merge.ts`** – imports `mergeReports`, `renderHtml`, `formatSummary`, and the `ShardReport` / `StrykerReport` types. The actual report-merging and HTML/Markdown rendering happen in that module.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** and **`tests/unit/scripts/mutation/ci/merge.test.ts`** – unit-test the two modules this CLI delegates to; they do not exercise this file directly.

## Notes

- **Stdout is reserved for GitHub Actions.** Any `console.log` here is parsed as `key=value` output; human-facing messages must use `console.error`. Mixing the two silently breaks workflow step outputs.
- **`tmp/stryker.ci.json` is regenerated every job.** It is never committed; the config is always derived from the repo's `stryker.json` plus the slicing plugin, so local and CI runs share the same base configuration.
- **JSON reads are unvalidated.** `readJson` does a raw `JSON.parse`; callers cast to the expected type. This is safe only because every file read was written by this same pipeline or by Stryker's own JSON reporter.
- **CI-only path.** None of this file's exports or logic are used by `npm run mutation:full`, which runs Stryker with its own `stryker.json` and its own scope.
- **Exit code semantics.** An unknown subcommand exits 2 (usage error). A missing shard name or empty plans directory throws an `Error` (exit 1). Shard-level failures are recorded as outcomes, not propagated as process exits.
