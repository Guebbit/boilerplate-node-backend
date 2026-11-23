---
source: scripts/mutation/sharding.ts
source_sha256: 9b649e92cb7c02866b797ff5766ed738633efa03d4b24bb6ebd5f90b5e1810a3
context_sha256: 73068531055a921a425670e63accd7efd670b7c2cd755b650bed8b80a2d38121
generated_at: 2026-11-22T02:10:45.730637+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/mutation/sharding.ts

## Purpose
Builds the shards for the local full mutation sweep (`npm run mutation:full`) by balancing source line counts instead of using a hand-maintained module list. Because shards are built from line counts over a file list supplied by the caller, new modules are picked up automatically, which avoids the drift that left several modules unmeasured. A separate, smaller shard plan exists for the GitHub sweep.

## Key elements
- `Shard` (interface): one shard of the mutate scope, with `name` (label), `mutate` (comma-separated file list for `--mutate`), and `lines` (the weight used for balancing).
- `TARGET_LINES_PER_SHARD` (const, `600`): target lines per shard. The comment cites a measured `shard-00` run of 1300 lines / 346 mutants taking 219 minutes at `--concurrency 2`, so 600 lines is roughly 100 minutes per shard. It can be overridden with `npm run mutation:full -- --shard-lines=<n>`.
- `packIntoShards(files, targetLines = TARGET_LINES_PER_SHARD)`: greedy largest-first bin packing.
  - Shard count is `max(1, ceil(totalLines / targetLines))`.
  - Files are sorted by lines descending, and each goes into the bin with the fewest lines so far.
  - Returns shards named `shard-00`, `shard-01`, and so on, each with its files sorted alphabetically and joined by commas.

## Relationships
- `scripts/mutation/run-shards.ts` and `scripts/mutation/local-policy.ts` are graph neighbors of this file. The visible content does not show how they use it, but the `Shard` shape and `packIntoShards` are the exports they would consume.
- `tests/unit/scripts/mutation/sharding.test.ts` covers this file directly. `tests/unit/scripts/mutation/local-policy.test.ts` and `tests/unit/scripts/mutation/ci/waves.test.ts` are related neighbors; the latter relates to the separate GitHub sweep planner mentioned in the file's header comment.
- The file's header comment says the file list comes from a scope-walking script and that the GitHub sweep plans its own shards elsewhere. Neither is imported here.

## Notes
- The file has no imports. It is a pure function over `{ file, lines }[]`, and the caller is responsible for supplying the file list.
- A larger `targetLines` gives fewer, bigger shards. Every shard pays the whole-suite dry run again, so that overhead is per shard, not per mutant.
- Shard count is derived from the target, but the balancing is a heuristic, so a shard can exceed the target. A single file larger than the target ends up alone in a shard that is over it.
- It uses `Array.prototype.toSorted`, so it needs a runtime that supports it (Node 20+).
- The header comment points to a doc page on "the three commands" for the shape this feeds.
