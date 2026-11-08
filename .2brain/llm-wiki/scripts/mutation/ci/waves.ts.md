---
source: scripts/mutation/ci/waves.ts
sha256: 402ee21fc70541f437ce4f40190c8f80d58ab4198d72efd1301f096573e0b5da
generated_at: 2026-11-08T02:53:24.767215+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/ci/waves.ts

## Purpose

The planner for the GitHub mutation-testing sweep. It decides how the mutate scope is split into shards for each wave's matrix, what a failed shard becomes in the next wave (split into smaller slices, retried, or abandoned), and caps each wave at GitHub's matrix limit. It is pure — the CLI handles all I/O.

## Key elements

- **`MAX_SHARDS_PER_WAVE` (256), `SHARD_LINES` (200), `SPLIT_FACTOR` (4), `MIN_SLICE_LINES` (8), `MAX_ERROR_RETRIES` (1)** — tunable constants governing shard size, split granularity, and retry limits.
- **`ScopeFile`** — a mutable file with `lines` (non-blank, the cost proxy) and `physicalLines` (for slice indexing).
- **`Unit`** — a whole file or a slice of one (`slice?: LineSlice`).
- **`CiShard`** — one matrix job: a name (`w<wave>-<index>`), its units, and a non-time error counter.
- **`WavePlan`** — the artifact uploaded per wave: wave number, full scope, this wave's shards, overflow backlog, and cumulative abandoned shards.
- **`unitsOf(file)`** — slices a file into `ceil(lines/SHARD_LINES)` units if it exceeds the cap; otherwise leaves it whole.
- **`splitUnit(unit)`** — cuts a timed-out unit into `SPLIT_FACTOR` contiguous pieces, or returns `undefined` if already below the minimum slice size.
- **`packUnits(units)`** — groups units into shards: each slice becomes its own shard; whole files are packed first-fit-decreasing to ≤ `SHARD_LINES`.
- **`firstWave(scope)`** — produces wave 1: the entire scope, big files pre-sliced, packed, and named.
- **`nextWave(previous, outcomes)`** — takes the prior `WavePlan` and a name→outcome map; splits timed-out shards, retries error shards once, accumulates abandoned shards, prepends the old backlog, and schedules wave N+1.
- **`outcomeOf(exitCode, hasReport)`** — maps a Stryker exit code + report presence to `'reported' | 'timeout' | 'error'` (report on disk beats exit code; 124/137 → timeout).
- **`strykerArguments(shard)`** — derives the `--mutate` file list and `MUTATION_SLICE` env value for a shard's Stryker invocation.
- **`spanOf(unit)`** — returns the `LineSlice` a unit covers (its explicit slice or the whole file).
- **`ShardOutcome`** — union type: `'reported' | 'timeout' | 'error'`.

## Relationships

- **`slice-ignorer.ts`** — provides the `LineSlice` type that `Unit`, `spanOf`, and `cut` all operate on.
- **`cli.ts`** — imports `firstWave`, `nextWave`, `outcomeOf`, and `strykerArguments` to drive the sweep; performs all file I/O that this module avoids.
- **`merge.ts`** — consumes the `WavePlan` artifact (specifically `scope` and `abandoned`) to identify finished files and skip them.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — unit tests covering the packing, splitting, and wave-scheduling logic.
- **`tests/unit/scripts/mutation/ci/merge.test.ts`** — tests the merge step that reads the `WavePlan` this file produces.

## Notes

- `lines` (non-blank) is the cost proxy used for sizing; `physicalLines` is what slice `from`/`to` index into. Never confuse the two.
- `packUnits` uses a hard cap of `SHARD_LINES` (first-fit-decreasing), which differs from `sharding.ts`'s balanced-bin approach — a shard may be under-filled.
- A slice always gets its own shard (one unit) because `MUTATION_SLICE` governs the entire Stryker run, so mixing slices and files in one shard is not valid.
- `outcomeOf` treats the presence of `mutation.json` as the source of truth over the exit code; Stryker only writes it after the last mutant completes.
- The module is intentionally stateless: all cross-wave state lives in the `WavePlan` object passed between calls.
