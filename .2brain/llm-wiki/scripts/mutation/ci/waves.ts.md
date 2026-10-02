---
source: scripts/mutation/ci/waves.ts
sha256: 1e8c2f03e4d9ea600019b485427dbc80a0a0da16d9efba1201d5524c0b8534b5
generated_at: 2026-10-01T12:33:03.666502+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/waves.ts

## Purpose

Pure planning logic for the GitHub mutation-testing sweep. Given a set of files (or line-slices) and the outcomes of the previous wave, it decides what each wave's matrix of shards will run, how a timed-out shard is split smaller, and when a shard is abandoned. The module performs no I/O; all file reading and artifact writing lives in the CLI.

## Key elements

- **Constants** — `MAX_SHARDS_PER_WAVE` (256, GitHub matrix cap), `SHARD_LINES` (200, cost proxy per shard), `SPLIT_FACTOR` (4, pieces a timed-out unit is cut into), `MIN_SLICE_LINES` (8, below this a slice is not split again), `MAX_ERROR_RETRIES` (1, non-timeout failures before abandonment).
- **Types** — `ScopeFile` (file + line counts), `Unit` (a file or a line-slice), `CiShard` (one matrix job: name, units, error count), `ShardOutcome` (`'reported' | 'timeout' | 'error'`), `WavePlan` (the full per-wave artifact: scope, shards, backlog, abandoned).
- **`spanOf`** — returns the effective line range of a unit (its slice, or the whole file).
- **`cut`** (private) — splits a unit's range into *parts* contiguous sub-slices with proportionally distributed line counts.
- **`unitsOf`** — initial decomposition: a file that fits `SHARD_LINES` stays whole; otherwise it is pre-sliced.
- **`splitUnit`** — splits a timed-out unit into `SPLIT_FACTOR` pieces, or returns `undefined` if it is too small (`< factor × MIN_SLICE_LINES`).
- **`packUnits`** — groups units into shards: each slice gets its own shard; whole files are first-fit-decreasing up to `SHARD_LINES`.
- **`firstWave`** — builds the wave-1 `WavePlan` from the full scope.
- **`nextWave`** — builds wave *N+1* from the previous plan and a `Map<shardName, ShardOutcome>`; retries, splits, abandons, and carries forward backlog + abandoned.
- **`retryOf`** (private) — per-shard decision: reported → done; timeout with multiple units → one shard per unit; timeout with one unit → `splitUnit`; error → retry once then abandon.
- **`outcomeOf`** — maps a Stryker exit code + report-presence flag to a `ShardOutcome` (report on disk wins; 124/137 → timeout).
- **`strykerArguments`** — produces the `--mutate` file list and `MUTATION_SLICE` string for one shard.

## Relationships

- **`scripts/mutation/ci/cli.ts`** — the CLI reads the scope, calls `firstWave` / `nextWave`, uploads the `WavePlan` as an artifact, and calls `outcomeOf` and `strykerArguments` to drive the Stryker step. This module exports only pure logic and types.
- **`scripts/mutation/ci/merge.ts`** — consumes the final `WavePlan` (scope, abandoned) to reconcile results across waves.
- **`scripts/mutation/ci/slice-ignorer.ts`** — provides the `LineSlice` type (`{ from, to }`) used throughout this module.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — unit tests for the planning functions in this file.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — tests merge, which depends on the `WavePlan` shape defined here.

## Notes

- `SHARD_LINES` is a **floor**, not a target: heavier files will time out and be split by design; that is the recovery path, not a misconfiguration.
- Slices **always** get a dedicated shard (one per matrix job) because `MUTATION_SLICE` applies to the entire Stryker invocation; they are never packed with whole files.
- Whole-file packing uses **first-fit-decreasing**, which is intentionally different from the balanced bin-packing in `sharding.ts`.
- Shard names follow `w<wave>-<index>` with a zero-padded 3-digit index (e.g. `w1-000`), unique across the whole run.
- A shard with **no entry** in the outcomes map (runner lost mid-job) is treated as an error, not a timeout.
- The module is pure: no imports beyond the `LineSlice` type from `slice-ignorer.ts`.
