---
source: tests/unit/scripts/mutation/ci/waves.test.ts
sha256: 24db34c42eba7fdf484b5ca860e447f2af4b75bd04dcabb7fe0973937182a367
generated_at: 2026-11-08T10:38:51.322511+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/ci/waves.test.ts

## Purpose

Unit tests for the CI mutation-sweep planner (`scripts/mutation/ci/waves.ts`). Every test either asserts that no line of the mutation scope is dropped when a shard is split, re-packed, or retried, or verifies the single decision rule that maps a shard's exit status to a `ShardOutcome` and drives the next wave.

## Key elements

- **`file(name, lines)`** – local helper that builds a `ScopeFile` with a realistic `physicalLines` ratio (1.2×).
- **`coverage(units)`** – local helper that expands a set of units into a `{ fileName: number[] }` map of covered line numbers; used to assert full, gap-free coverage.
- **`allLines(n)`** – returns `[1, 2, …, n]` for direct comparison against `coverage`.
- **`everyShard(plan)`** – flattens `plan.shards` + `plan.backlog` into one array.
- **`describe('unitsOf')`** – verifies that a file ≤ `SHARD_LINES` stays whole, and a larger file is sliced into contiguous, non-overlapping units covering every physical line exactly once.
- **`describe('splitUnit')`** – verifies a unit is cut into `SPLIT_FACTOR` slices over the same line span, and that a unit smaller than the split threshold returns `undefined`.
- **`describe('packUnits')`** – verifies that sliced units are always packed alone (one unit per shard) and that whole-file shards never exceed `SHARD_LINES`.
- **`describe('firstWave')`** – verifies the initial plan covers every line of the scope, shard names are unique, the first shard is `w1-000`, and the wave is capped at `MAX_SHARDS_PER_WAVE` with the remainder in `backlog`.
- **`describe('nextWave')`** – the largest block. Verifies outcome-driven transitions:
  - `reported` → shard is dropped.
  - `timeout` on a multi-file shard → each file becomes its own shard.
  - `timeout` on a single-file shard → split into `SPLIT_FACTOR` slices over the same lines.
  - `error` → retried verbatim (renamed for the new wave) up to `MAX_ERROR_RETRIES`, then moved to `abandoned`.
  - Missing outcome (no entry in the map) → treated as `error` (crash).
  - A timed-out slice too small to split → treated as a crash, not split forever.
  - Retries are scheduled before backlog shards, both renamed for the new wave number.
- **`describe('outcomeOf')`** – maps `(exitCode, hasReport)` to `'reported'`, `'timeout'` (124/137), or `'error'`.
- **`describe('strykerArguments')`** – verifies the `--mutate` file list and the `MUTATION_SLICE` range string passed to the Stryker CLI.

## Relationships

- **`scripts/mutation/ci/waves.ts`** – the sole import target. All exported symbols (`unitsOf`, `splitUnit`, `packUnits`, `firstWave`, `nextWave`, `outcomeOf`, `strykerArguments`, `spanOf`, the `CiShard`/`ScopeFile`/`Unit`/`ShardOutcome` types, and the constants `MAX_ERROR_RETRIES`, `MAX_SHARDS_PER_WAVE`, `SHARD_LINES`, `SPLIT_FACTOR`) are exercised directly. The test file defines no behavior of its own; it is purely a consumer of that module's public API.

## Notes

- The file imports from a triple-nested relative path (`../../../../../scripts/mutation/ci/waves`), consistent with the repo's flat `tests/unit/scripts/mutation/ci/` mirror layout.
- The invariant "no line is dropped" is asserted by comparing `coverage(units)` against `allLines(physicalLines)`, not by counting units—so overlapping or missing lines both fail.
- `SPLIT_FACTOR` and `MAX_ERROR_RETRIES` are used in test assertions via template literals (e.g., `` `retries … ${MAX_ERROR_RETRIES} time` ``), keeping descriptions in sync with the constants automatically.
- The `physicalLines` value (1.2× `lines`) is what the planner actually slices on; tests treat `lines` as a logical count but assert coverage against `physicalLines`.
