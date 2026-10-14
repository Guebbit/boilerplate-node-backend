---
source: scripts/mutation/ci/waves.ts
sha256: aefe3493d7842bce699966432a22a0dc421687255bc3e9bf74496131685cce49
generated_at: 2026-10-14T07:20:13.140523+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/waves.ts

## Purpose

Pure planner for the GitHub mutation-testing sweep. Given a scope of mutable files, it decides how to slice work into shards (matrix jobs) across successive waves, how timed-out shards are split and requeued, and how errors are retried or abandoned. It contains no I/O — `cli.ts` performs all file reading/writing.

## Key elements

- **Constants**
  - `MAX_SHARDS_PER_WAVE` (256) — GitHub's per-matrix job cap.
  - `SHARD_LINES` (200) — non-blank-line budget per shard; also the slice size for large files.
  - `SPLIT_FACTOR` (4) — pieces a timed-out unit is cut into.
  - `MIN_SLICE_LINES` (8, unexported) — below this a slice is no longer split.
  - `MAX_ERROR_RETRIES` (1) — non-timeout failures before a shard is abandoned.

- **Types**
  - `ScopeFile` — a file with `lines` (cost proxy) and `physicalLines` (indexing range).
  - `Unit` — a whole file or a `LineSlice` of one.
  - `CiShard` — one matrix job: name, units, error count.
  - `ShardOutcome` — `'reported' | 'timeout' | 'error'`.
  - `WavePlan` — the serializable plan artifact: wave number, scope, shards, backlog, abandoned.

- **Functions**
  - `spanOf(unit)` — returns the line range a unit covers (slice or full file).
  - `cut(unit, parts)` *(private)* — splits a range into `parts` roughly-equal contiguous slices, distributing `lines` proportionally.
  - `unitsOf(file, shardLines?)` — pre-slices a large file into units sized to one shard.
  - `splitUnit(unit, factor?)` — cuts a timed-out unit into `factor` pieces, or returns `undefined` if too small.
  - `packUnits(units, shardLines?)` — groups units into shard arrays: slices get their own shard; whole files are first-fit-decreasing up to `shardLines`.
  - `firstWave(scope, shardLines?)` — builds wave 1: all files, big ones pre-sliced, packed, named, capped.
  - `nextWave(previous, outcomes)` — builds the following wave from prior failures (split or retry) plus the prior backlog.
  - `retryOf(shard, outcome)` *(private)* — the per-shard decision: split on timeout, retry-once on error, abandon after retries.
  - `outcomeOf(exitCode, hasReport)` — maps a Stryker step's exit code + report presence to a `ShardOutcome`.
  - `strykerArguments(shard)` — produces the `--mutate` file list and `MUTATION_SLICE` value for one shard's command line.

## Relationships

- **`scripts/mutation/ci/slice-ignorer.ts`** — provides the `LineSlice` type used by `Unit`, `spanOf`, `cut`, and `strykerArguments`.
- **`scripts/mutation/ci/cli.ts`** — the I/O layer that calls `firstWave`, `nextWave`, `outcomeOf`, and `strykerArguments`; this file stays pure.
- **`scripts/mutation/ci/merge.ts`** — consumes `WavePlan.scope` and `WavePlan.abandoned` to determine which files are finished and which to merge results for.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — unit tests for the planning, packing, splitting, and wave-sequencing logic in this file.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — exercises merge against `WavePlan` structures produced by this module.

## Notes

- Slices always get their own shard (`packUnits` puts them first); they are never co-packed with whole files. This matters because a slice's `MUTATION_SLICE` env var governs the entire Stryker run for that job.
- `SHARD_LINES` is a *hard cap* in `packUnits` (first-fit-decreasing), unlike the balanced-bin packing in `sharding.ts`.
- `outcomeOf` treats the on-disk report as authoritative over the exit code: Stryker writes the report only after the last mutant, so its presence means the job truly completed. Exit 124 is `timeout`'s own signal; 137 is its `--kill-after` follow-up.
- A shard with multiple units that times out is split one-unit-per-shard (not sliced further). Only a single-unit shard gets `splitUnit` treatment.
- `MIN_SLICE_LINES` is deliberately unexported; it is an internal guard, not a tunable for callers.
