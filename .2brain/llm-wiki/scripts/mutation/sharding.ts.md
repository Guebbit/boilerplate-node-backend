---
source: scripts/mutation/sharding.ts
sha256: 205c193443e76bda109744ecd48b6b94a14985ed8c32ffeb563c71c2657a5850
generated_at: 2026-10-01T12:33:56.797676+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/sharding.ts

## Purpose

Defines how the local full mutation sweep (`npm run mutation:full`) partitions its mutate scope into shards of roughly equal size, using line count as the balancing metric. The design avoids a hand-maintained module list (which drifted and left five modules unmeasured for a month) by deriving shards from whatever scope `mutate-scope.ts` resolves at run time.

## Key elements

- **`Shard`** (interface) — one shard: `name` (e.g. `shard-00`), `mutate` (comma-separated file list for `--mutate`), and `lines` (total line count in that shard).
- **`TARGET_LINES_PER_SHARD`** (constant, `600`) — default budget per shard. Calibrated from a measured 346-mutant shard taking ~219 min at `--concurrency 2`; 600 lines ≈ 100 min. Overridable via `--shard-lines=<n>`.
- **`packIntoShards(files, targetLines?)`** (function) — largest-file-first greedy bin-packing. Sorts files descending by line count, then drops each into the currently lightest bin. Returns `Shard[]` with zero-padded names and alphabetically-sorted `mutate` lists.

## Relationships

- **`tests/unit/scripts/mutation/sharding.test.ts`** — unit-tests `packIntoShards` edge cases (single file, empty input, target-line override).
- **`scripts/mutation/run-shards.ts`** — consumes the `Shard[]` output; each shard's `mutate` string is passed to the Stryker CLI invocation.
- **`scripts/mutation/local-policy.ts`** — supplies the file/line-count list (the `files` argument) that `packIntoShards` receives, derived from the resolved mutate scope.
- **`github/workflows/mutation.yml`** — the CI workflow uses a *separate* shard planner (`scripts/mutation/ci/waves.ts`); this module is exclusively for the local `npm run mutation:full` path.

## Notes

- Shard count is `ceil(totalLines / targetLines)` with a floor of 1 — a scope smaller than one target still produces a single shard.
- Every shard re-runs the whole-suite dry run, so fewer/larger shards reduce fixed overhead; `TARGET_LINES_PER_SHARD` intentionally favors fewer shards for that reason.
- The `mutate` field in each `Shard` is a sorted, comma-joined string, not an array — it is meant to be interpolated directly into a `--mutate` CLI flag.
- Bin-packing is a greedy heuristic, not an exact solution; the doc comment explicitly notes it avoids the NP-hard exact-partition problem on purpose.
