---
source: scripts/mutation/ci/cli.ts
source_sha256: 947e7ffbae93d6f96ba82b2e9a0a6198bc32463a0420010422f1bd756fea1e8d
context_sha256: 00b23d7abe8d342f659b35959108a30bf0276248150f6b2e50cb1a397265fa90
generated_at: 2026-11-22T02:08:11.282734+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/ci/cli.ts

## Purpose
The command-line entry point for the GitHub mutation-testing sweep. Each step in `mutation.yml` and `mutation-wave.yml` calls one subcommand. The planning, merging and slicing logic lives in the pure modules beside it (`waves.ts`, `merge.ts`). This file only handles argument parsing, file I/O and printing. It is CI-only: `npm run mutation:full` does not use it and keeps its own `stryker.json` run.

## Key elements
- **Subcommands**, dispatched from the `commands` table keyed on `process.argv[2]`:
  - `config` (`writeConfig`): reads `stryker.json` and writes the CI config to `CI_CONFIG_PATH` (under `tmp/`). The output is the same config plus the slicing plugin in `appendPlugins` and `ci-slice` in `ignorers`.
  - `wave` (`planWave`): with `--wave=1` it calls `firstWave(scope())`. For later waves it calls `nextWave` with the `--previous` plan and the outcomes read from `--outcomes`. It writes the plan to `--out` and emits `shards` (JSON array of names) and `count`.
  - `shard` (`showShard`): finds `--name` in the `--plan` and emits `mutate` and `slice` from `strykerArguments`. It throws if the shard is not in the plan.
  - `outcome` (`recordOutcome`): turns `--exit` and whether `REPORT_PATH` exists into a status via `outcomeOf`. It writes `<out>/<name>.json` and emits `status`.
  - `merge`: reads all wave plans from `--plans` and shard reports from `--reports`. It calls `mergeReports` against the last plan's `scope`, then writes the merged report, an HTML page (via `renderHtml`) and a markdown summary (via `formatSummary`) into `--out`. It emits `incomplete`.
- `option(name)`: reads a required `--name=value` flag through `flagValue` and throws if it is missing.
- `readJson`, `writeOut`, `output`: helpers for reading JSON (the result is cast, not validated), writing a file after creating its directory, and printing a `key=value` line.
- `scope()`: maps `mutableFiles()` to `{file, lines, physicalLines}`, where `lines` is `lineCount(file)` and `physicalLines` is the raw `\n`-split count.
- `readOutcomes` / `readFinished`: load outcome files by shard name, and pair each shard's Stryker report with its plan entry in sorted directory order.
- Constants: `CI_CONFIG_PATH`, `SLICE_PLUGIN`, `WEAKEST_SHOWN` (15, the number of lowest-scoring files listed in the summary).

## Relationships
- `scripts/cli.ts`: supplies `flagValue` for flag parsing.
- `scripts/mutation/ci/waves.ts`: supplies `firstWave`, `nextWave`, `outcomeOf`, `strykerArguments` and the `WavePlan` and `ShardOutcome` types.
- `scripts/mutation/ci/merge.ts`: supplies `mergeReports`, `renderHtml`, `formatSummary` and the `ShardReport` and `StrykerReport` types.
- `scripts/mutation/baseline.ts`: supplies `REPORT_PATH` and `scoresFromReport`. The latter ranks the weakest files.
- `scripts/mutation/mutate-scope.ts`: supplies `mutableFiles` and `lineCount` for the real mutate scope.
- `tests/unit/scripts/mutation/ci/merge.test.ts` and `waves.test.ts` cover the pure modules. This CLI is not tested there.

## Notes
- Stdout is reserved for `key=value` lines meant for `>> "$GITHUB_OUTPUT"`. All human-readable logging goes to stderr.
- An unknown or missing subcommand prints usage to stderr and exits with code 2.
- All JSON reads are cast with `as`. The code assumes the files were written by this pipeline or by Stryker.
- `readFinished` expects report directories named `shard-<name>`. `merge` takes the HTML template from the first finished shard's `index.html`, and skips the HTML output entirely if no shard finished.
- `merge` throws if no wave plan exists under `--plans`.
- The CI config is regenerated on every job and never committed.
