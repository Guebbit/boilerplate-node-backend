---
source: scripts/mutation/ci/waves.ts
sha256: 402ee21fc70541f437ce4f40190c8f80d58ab4198d72efd1301f096573e0b5da
generated_at: 2026-10-29T01:38:53.363949+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/waves.ts

## Purpose

Pure planner for the GitHub Actions mutation-testing sweep. Given a set of files to mutate, it sizes them into shards (matrix jobs), packs those shards into waves (≤ 256 jobs), and computes the next wave after failures — splitting timed-out work into smaller pieces or retrying errors once. It contains no I/O; the CLI owns reading scopes and writing artifacts.

## Key elements

- **`MAX_SHARDS_PER_WAVE`** (256) — GitHub's per-matrix job cap.
- **`SHARD_LINES`** (200) — non-blank line budget per shard; the sizing threshold.
- **`SPLIT_FACTOR`** (4) — how many pieces a timed-out unit is cut into.
- **`MAX_ERROR_RETRIES`** (1) — retries before a non-timeout failure is abandoned.
- **`ScopeFile` / `Unit` / `CiShard` / `WavePlan` / `ShardOutcome`** — the data model carried between waves and to the merge step.
- **`unitsOf(file)`** — converts a `ScopeFile` into one or more `Unit`s (whole file or pre-sliced).
- **`splitUnit(unit)`** — cuts a timed-out unit into `SPLIT_FACTOR` equal slices, or returns `undefined` if too small (`< 4 × 8` lines).
- **`packUnits(units)`** — groups units into unnamed shard arrays: slices get their own shard; whole files are first-fit-decreasing up to `SHARD_LINES`.
- **`firstWave(scope)`** — entry point for wave 1: sizes, packs, names, and caps the full scope.
- **`nextWave(previous, outcomes)`** — entry point for wave N+1: applies `retryOf` per shard, prepends the old backlog, and re-caps.
- **`outcomeOf(exitCode, hasReport)`** — maps a job's exit code + report presence to `'reported' | 'timeout' | 'error'`.
- **`strykerArguments(shard)`** — produces the `--mutate` file list and `MUTATION_SLICE` env value for Stryker.
- **`spanOf(unit)`** — resolves a unit's effective line range (its slice, or 1…physicalLines).

## Relationships

- **`./slice-ignorer.ts`** — imports the `LineSlice` type used throughout the unit/slice model.
- **`./cli.ts`** — the CLI reads the file scope, calls `firstWave`/`nextWave`, persists `WavePlan` artifacts, and calls `outcomeOf`/`strykerArguments` per job. This module performs no I/O.
- **`./merge.ts`** — consumes the final `WavePlan` (especially `scope` and `abandoned`) to assemble the full report.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — unit tests for the packing, splitting, and wave-transition logic.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — exercises the `WavePlan` shape this module produces.

## Notes

- **Hard cap vs. balanced bins:** `packUnits` uses a *hard* `SHARD_LINES` ceiling (a file over 200 lines is pre-sliced before packing). This differs from `sharding.ts`, which balances across bins.
- **Slices are isolated:** a `Unit` with a `slice` always gets its own shard in `packUnits` — it is never combined with other units, because `MUTATION_SLICE` covers the entire Stryker run for that job.
- **Retry semantics:** a multi-unit shard that times out is exploded into one shard per unit (no further split). A single-unit shard is split ×4. Errors (or missing outcome) get one retry of the identical work, then are moved to `abandoned`.
- **`MIN_SLICE_LINES` (8)** is module-private: slices shorter than `SPLIT_FACTOR × MIN_SLICE_LINES` (32 lines) are not split again — they are retried whole, then abandoned.
- **Exit codes:** `outcomeOf` treats 124 and 137 both as `'timeout'` (the latter is `timeout --kill-after`'s SIGKILL). Any other code without a report is `'error'`.
- **Wave naming:** `w<wave>-<zero-padded-index>` (e.g. `w1-007`). Names are unique across the run and are the join key for the outcomes map in `nextWave`.
