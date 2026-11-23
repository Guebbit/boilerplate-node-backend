---
source: scripts/mutation/local-policy.ts
source_sha256: 80a4d3ef792dcaf51b3925b86450ea88550f73e5faa9cff6b9eff75656539669
context_sha256: cacbdd6743ea60469a0baf78fc57c659ee553f65d69cb28410740df390bdbb4a
generated_at: 2026-11-22T02:09:23.573162+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/local-policy.ts

## Purpose
Decides which mutation-testing shards a local sweep runs, based on which shards already have reports from earlier evenings. It is the pure, testable half of `run-shards.ts`, so the resumability rule lives outside the CLI. There is no "run everything in one go" mode. The full scope is always sharded (`npm run mutation:full`).

## Key elements
- `ShardSelection` (interface): the result of a selection.
  - `run`: outstanding shards, after `--only` and `--limit` are applied.
  - `done`: shards skipped because a report already exists.
- `selectShards(shards, { completed, only, limit, force })`: returns a `ShardSelection`.
  - `completed`: shard names that already have a report on disk.
  - `only`: shard names to restrict to. Empty (the default) means all shards.
  - `limit`: maximum number of shards to run this evening. `undefined` means no cap.
  - `force`: ignores `completed`, so `done` is empty and every asked-for shard is outstanding.

## Relationships
- Imports the `Shard` type from `./sharding`.
- `run-shards.ts` is the CLI that this module's pure logic backs. The module doc says it is the pure half of that file.
- `tests/unit/scripts/mutation/local-policy.test.ts` tests the resumability rule.

## Notes
- Order of operations: filter by `only`, then split into `done` and outstanding, then apply `limit` to the outstanding list only. Skipped shards do not count against the limit.
- `limit` slices in the original shard order, so each evening picks up at the first shard without a report.
- Without `force`, a stale report is honoured indefinitely. Re-measuring requires `force`.
- Shard names in `only` that don't match any shard are silently ignored.
