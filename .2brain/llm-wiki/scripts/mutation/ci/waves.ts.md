---
source: scripts/mutation/ci/waves.ts
generated_at: 2026-11-22T02:08:59.112562+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/ci/waves.ts

## Purpose
The pure planner for the GitHub mutation-testing sweep. It decides what each wave's matrix runs and what a failed shard becomes in the next wave. Because per-line mutation cost varies ~10× between files and can't be predicted cheaply, the plan is allowed to be wrong: shards that time out come back as smaller pieces. This file does no I/O; the CLI reads and writes.

## Key elements
- **Constants**
  - `MAX_SHARDS_PER_WAVE` (256): GitHub's cap on matrix jobs.
  - `SHARD_LINES` (200): non-blank lines per shard, and the size a big file is sliced to.
  - `SPLIT_FACTOR` (4): number of pieces a timed-out shard is cut into.
  - `MAX_ERROR_RETRIES` (1): non-timeout failures allowed before work is abandoned.
  - `MIN_SLICE_LINES` (8, private): the minimum slice size used to decide whether to split.
- **Types**
  - `ScopeFile`: a mutable file with `lines` (non-blank, the cost proxy) and `physicalLines` (all lines).
  - `Unit`: a `ScopeFile` plus an optional `slice`.
  - `CiShard`: `name` (`w<wave>-<index>`), `units`, `errors`.
  - `ShardOutcome`: `'reported' | 'timeout' | 'error'`.
  - `WavePlan`: `wave`, `scope`, `shards`, `backlog`, `abandoned`. This is the plan artifact uploaded per wave.
- **Functions**
  - `spanOf(unit)`: the unit's slice, or `1..physicalLines`.
  - `unitsOf(file)`: a file whole if it fits in `SHARD_LINES`, otherwise cut into `ceil(lines / SHARD_LINES)` slices.
  - `splitUnit(unit)`: cuts into `SPLIT_FACTOR` slices, or returns `undefined` if the span is too small.
  - `packUnits(units)`: each slice gets its own shard. Whole files are packed first-fit-decreasing up to `SHARD_LINES`. Slices come first in the output.
  - `firstWave(scope)`: builds wave 1 from the whole scope.
  - `nextWave(previous, outcomes)`: applies `retryOf` to each previous shard and puts the retries ahead of the backlog.
  - `outcomeOf(exitCode, hasReport)`: a report on disk means `reported`. Otherwise exit 124 or 137 means `timeout`, and anything else means `error`.
  - `strykerArguments(shard)`: returns the `--mutate` list (comma-joined files) and the `MUTATION_SLICE` value (`from-to`, or an empty string).
- **Internal**
  - `cut`: splits a span into contiguous, roughly equal slices and shares `lines` out proportionally.
  - `scheduleWave`: names shards `w<wave>-NNN`, caps them at `MAX_SHARDS_PER_WAVE`, and carries the rest as backlog.
  - `retryOf`: decides what a shard becomes after its outcome.

## Relationships
- `slice-ignorer.ts`: provides the `LineSlice` type (`from`/`to`) that `Unit.slice` and `spanOf` use.
- `cli.ts`: the caller that does the reading and writing around these functions. It reads and writes the plan and outcome artifacts and invokes the planner.
- `merge.ts`: consumes `WavePlan` data. The carried-forward `scope` lets the merge tell which files are finished.
- `tests/unit/scripts/mutation/ci/waves.test.ts`: unit tests for this planner.
- `tests/unit/scripts/mutation/ci/merge.test.ts`: tests the merge, which relies on these plan types.

## Notes
- Retry rules in `retryOf`:
  - `reported`: no retry.
  - Timeout on a multi-unit shard: one shard per unit, with `errors` reset to 0.
  - Timeout on a single unit: split into `SPLIT_FACTOR` slices.
  - A unit too small to split is treated like an error: retried as-is until `errors` reaches `MAX_ERROR_RETRIES`.
  - Error, or a missing outcome (a lost runner): the same work is retried once, then moved to `abandoned`.
- Slice shards hold exactly one unit. `strykerArguments` reads only the first unit's slice.
- `SHARD_LINES` is a hard cap here, unlike the balanced bins in `sharding.ts`.
- The `SHARD_LINES` estimate comes from a measured 0.43 min/line at `--concurrency 2` (the median across the finished shards of one sweep). It is documented as a floor, since the shards that timed out were heavier.
- Shard names are unique across the run because the wave number is part of the name.
