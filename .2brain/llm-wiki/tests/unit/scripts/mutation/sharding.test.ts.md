---
source: tests/unit/scripts/mutation/sharding.test.ts
sha256: 435460aadf0f334a4249148aab3b16d918eac41c5775e076d3ed2017dc557785
generated_at: 2026-09-23T20:31:42.824691+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/sharding.test.ts

## Purpose

Unit tests for `packIntoShards`, the function that partitions a list of files (by line count) into evenly-sized shards for the mutation-testing CI matrix. Tests run against synthetic file lists only—no directory walks—mirroring the thin-CLI-wrapper / testable-core split used elsewhere in this project.

## Key elements

- **`files(...entries)`** — small helper that converts `[name, lines]` tuples into `{ file, lines }` objects so fixtures read as positional pairs.
- **`describe('packIntoShards')`** — six cases:
  - *Every file lands in exactly one shard* — asserts completeness and that total lines are preserved across shards.
  - *Explicit target overrides CI default* — passing `2500` as the target yields 2 shards instead of the ~9 the 600-line default would produce.
  - *Shard count derives from total lines, not file count* — 10 × 500-line files produce `Math.ceil(5000 / TARGET_LINES_PER_SHARD)` shards.
  - *Lopsided input is balanced* — one 6000-line file plus twenty 50-line files; asserts the max/min shard ratio ≤ `6000/50` (the ceiling set by the un-splittable huge file).
  - *No empty shards* — a single 10-line input still produces a shard with `mutate.length > 0`.
  - *Deterministic naming* — identical input yields `toEqual`-equal output on repeated calls.

## Relationships

- **`scripts/mutation/sharding.ts`** — sole import source. Provides `packIntoShards` (the function under test) and the exported constant `TARGET_LINES_PER_SHARD` (used in the shard-count assertion and implicitly as the default when no target is passed).

## Notes

- The lopsided-input test encodes the design motivation in comments: a single huge module (e.g. `account`) must not set the wall clock for the entire matrix.
- The balance bound (`6000/50`) is deliberately the *input-derived ceiling* (the huge file's lines over the smallest bin a tiny file can leave), not an arbitrary constant, so it stays valid if `TARGET_LINES_PER_SHARD` changes.
- Shard shape is `{ mutate: string, lines: number }` where `mutate` is a comma-separated file list.
