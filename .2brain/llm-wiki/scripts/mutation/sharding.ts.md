---
source: scripts/mutation/sharding.ts
sha256: 205c193443e76bda109744ecd48b6b94a14985ed8c32ffeb563c71c2657a5850
generated_at: 2026-11-08T02:54:44.559958+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/sharding.ts

## Purpose

Defines the sharding strategy for the local full mutation sweep (`npm run mutation:full`). Instead of hard-coding a module list (which drifted and left modules unmeasured), it derives shards from the actual mutate scope by line count, using a greedy bin-packing heuristic. The result is a set of `Shard` objects that downstream tooling can execute in parallel.

## Key elements

- **`Shard`** (interface) — One shard: `name` (e.g. `shard-00`), `mutate` (comma-separated file list for `--mutate`), `lines` (total line count in the shard).
- **`TARGET_LINES_PER_SHARD`** (const, `600`) — Default line budget per shard. Calibrated from a measured run (~38 s/mutant at concurrency 2 → ~100 min per shard). Override via `--shard-lines=<n>`.
- **`packIntoShards(files, targetLines?)`** (const fn) — Largest-file-first greedy bin packing: sorts files by line count descending, places each into the currently least-loaded bin. Returns an array of `Shard`. Shard count is `ceil(totalLines / targetLines)`, minimum 1.

## Relationships

- **`scripts/mutation/local-policy.ts`** — Provides the mutation policy/scope that feeds the file list into `packIntoShards`. Together they determine *which* files are mutated and *how* they are grouped.
- **`scripts/mutation/run-shards.ts`** — Consumes the `Shard[]` array produced here and executes each shard (spawns the Stryker process with the shard's `mutate` string).
- **`tests/unit/scripts/mutation/sharding.test.ts`** — Unit tests for `packIntoShards` edge cases (empty input, single file, uneven distribution).
- **`tests/unit/scripts/mutation/local-policy.test.ts`** — Tests the policy/scope module that upstream-feeds this file.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — Tests the *separate* CI sharding strategy (`ci/waves.ts`), which plans its own smaller shards for the GitHub sweep; not a consumer of this file but a parallel concern.

## Notes

- The `mutate` field in each shard is **lexicographically sorted** (`.toSorted().join(',')`) so the string is deterministic regardless of packing order.
- The greedy packing is intentionally approximate; the docstring calls it a scheduling heuristic, not an optimal partition.
- Every shard re-runs the whole-suite dry run, so overhead is *per shard*. Fewer, larger shards reduce that overhead — pass a larger `targetLines` on slower machines.
- This file only handles the **local** sweep. The GitHub CI sweep uses `scripts/mutation/ci/waves.ts` with a different (smaller) shard plan; the two do not share packing logic.
