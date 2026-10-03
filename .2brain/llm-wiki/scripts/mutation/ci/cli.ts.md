---
source: scripts/mutation/ci/cli.ts
sha256: 0ce21254eef5ac44b7bb409f4bbba51e7b949150a0db7b9606706904f05cfa6d
generated_at: 2026-10-01T12:32:15.488145+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/cli.ts

## Purpose

Command-line dispatch for the GitHub Actions mutation-sweep workflows (`mutation.yml`, `mutation-wave.yml`). Each workflow step invokes one subcommand (`config`, `wave`, `shard`, `outcome`, `merge`); this file parses arguments, reads/writes files, and delegates all domain logic to the pure modules that live beside it.

## Key elements

- **`option(name)`** – extracts a required `--name=value` flag from `process.argv`; throws if absent.
- **`readJson(file)` / `writeOut(file, content)`** – thin JSON/file I/O helpers; `writeOut` creates parent directories.
- **`output(key, value)`** – prints a `key=value` line to **stdout** so the workflow can append it to `$GITHUB_OUTPUT`.
- **`writeConfig()`** – copies `stryker.json`, appends the `ci-slice` ignorer and the slicing plugin, writes the result to `tmp/stryker.ci.json`.
- **`scope()`** – returns the mutable file list with logical and physical line counts (from `mutate-scope`).
- **`planWave()`** – plans wave 1 (`firstWave`) or a subsequent wave (`nextWave`) and emits the shard-name matrix via `output`.
- **`showShard()`** – resolves one shard from the plan and emits its `--mutate` list and optional `MUTATION_SLICE`.
- **`recordOutcome()`** – derives a `ShardOutcome` from the exit code + report presence and writes a per-shard outcome JSON.
- **`readFinished()`** – pairs each finished shard's `mutation.json` with its plan entry across all wave plans.
- **`merge()`** – calls `mergeReports`, renders the HTML report, writes `summary.md` (weakest N files), and emits the incomplete count.
- **`commands`** – the dispatch map; the script exits 2 with a usage message if the subcommand is unknown.

## Relationships

- **`scripts/mutation/ci/waves.ts`** – provides `firstWave`, `nextWave`, `outcomeOf`, `strykerArguments`, and the `WavePlan` / `ShardOutcome` types consumed by `planWave`, `showShard`, and `recordOutcome`.
- **`scripts/mutation/ci/merge.ts`** – provides `mergeReports`, `formatSummary`, `renderHtml`, and the `ShardReport` / `StrykerReport` types used by the `merge` subcommand.
- **`scripts/mutation/baseline.ts`** – exports `REPORT_PATH` (the expected Stryker report location) and `scoresFromReport` (per-file scores for the summary).
- **`scripts/mutation/mutate-scope.ts`** – exports `mutableFiles` and `lineCount`, the scope the planner operates on.

## Notes

- **stdout vs stderr:** stdout is reserved exclusively for `key=value` lines consumed by `$GITHUB_OUTPUT`; all human-readable logging goes to stderr. Mixing the two will corrupt the workflow output.
- **CI-only path:** this CLI is never invoked by `npm run mutation:full`, which uses its own `stryker.json` and a single Stryker run.
- **Untrusted-by-design JSON:** `readJson` does not validate schemas—every file read was written by this pipeline or Stryker's JSON reporter, so shape is guaranteed by construction.
- **Config is ephemeral:** `tmp/stryker.ci.json` is regenerated each job and lives under `tmp/` (gitignored) specifically to stay outside Stryker's sandbox copy.
- **Argument parsing is minimal:** the `--name=` prefix scan is a simple `startsWith` + `slice`; there is no help flag, no boolean handling, and every argument is required.
