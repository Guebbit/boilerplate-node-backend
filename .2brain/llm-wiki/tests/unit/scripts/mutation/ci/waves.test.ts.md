---
source: tests/unit/scripts/mutation/ci/waves.test.ts
sha256: 24db34c42eba7fdf484b5ca860e447f2af4b75bd04dcabb7fe0973937182a367
generated_at: 2026-10-15T13:28:43.343307+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/ci/waves.test.ts

## Purpose

Unit tests for the CI mutation-testing wave planner (`scripts/mutation/ci/waves.ts`). Every test enforces one of two invariants: (1) no source line in the scope is ever dropped between waves, or (2) the single rule that maps a shard's outcome (reported / timeout / error) to its next action (remove, split, or retry-then-abandon).

## Key elements

- **`unitsOf`** – Verified to keep a file whole when it fits `SHARD_LINES`, and to slice larger files into contiguous, non-overlapping units that cover every physical line exactly once.
- **`splitUnit`** – Verified to produce exactly `SPLIT_FACTOR` slices over the same line range, and to return `undefined` for a unit too small to split.
- **`packUnits`** – Verified that any unit carrying a `slice` field is placed alone in its shard (Stryker's `MUTATION_SLICE` constraint), and that whole-file shards never exceed `SHARD_LINES` total.
- **`firstWave`** – Verified to cover every line of the scope, assign unique shard names starting at `w1-000`, cap the wave at `MAX_SHARDS_PER_WAVE`, and push the remainder to `backlog`.
- **`nextWave`** – The core retry/progression logic: reported shards are removed; timed-out shards are split per-file (or sliced if single-file); errored shards are retried up to `MAX_ERROR_RETRIES` times before landing in `abandoned`; missing outcomes are treated as crashes; retries are ordered before backlog items and renamed for the new wave.
- **`outcomeOf`** – Maps `(exitCode, hasReport)` to `'reported'` (report on disk wins), `'timeout'` (exit 124/137 without report), or `'error'` (everything else).
- **`strykerArguments`** – Builds the Stryker CLI args object: comma-joined `mutate` list and an empty or `from-to` `slice` string.

## Relationships

- **`scripts/mutation/ci/waves.ts`** – The sole import target; all tested exports (`firstWave`, `nextWave`, `outcomeOf`, `packUnits`, `splitUnit`, `spanOf`, `unitsOf`, `strykerArguments`, and the constants `SHARD_LINES`, `SPLIT_FACTOR`, `MAX_SHARDS_PER_WAVE`, `MAX_ERROR_RETRIES`) come from this module. Types (`CiShard`, `ScopeFile`, `ShardOutcome`, `Unit`) are imported as well.

No other graph neighbors are directly imported or referenced by this test file.

## Notes

- `physicalLines` in test fixtures is `lines × 1.2` (rounded), mirroring how the real scope counts non-blank vs. total lines; coverage assertions use `physicalLines`, not `lines`.
- The `coverage()` helper expands each unit's `spanOf` into a per-file `Set` of line numbers, then sorts — it is the single mechanism that proves the "no line dropped" invariant across every describe block.
- `splitUnit` returning `undefined` for tiny units is not an error; `nextWave` handles it by treating the unit as a crash (incrementing `errors`) rather than looping infinitely.
