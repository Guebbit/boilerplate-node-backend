---
source: scripts/mutation/sharding.ts
sha256: 86ff5e972048de7615ba3f903f9e446676f1b3f636b00f180bc713ab1eb2e319
generated_at: 2026-09-23T17:29:11.631903+00:00
model: ollama:qwen3.8:27b
---

# scripts/mutation/sharding.ts

## Purpose

Converts a flat list of mutation-testable files (with line counts) into balanced CI shards via greedy bin-packing. Exists so the weekly full-sweep matrix is derived from measured scope rather than a hand-maintained module list, which previously drifted when new modules were added.

## Key elements

- **`Shard` interface** — A single shard: `name` (CI-matrix label like `shard-00`), `mutate` (comma-separated file list for Stryker's `--mutate`), and `lines` (total line count in that shard).
- **`TARGET_LINES_PER_SHARD`** — Constant set to **600**. Derived from a measured 1300-line shard taking ~100 min at `--concurrency 2`. Also the default parameter for `packIntoShards`.
- **`packIntoShards(files, targetLines?)`** — Sorts files largest-first, then assigns each to the currently lightest bin (greedy N-to-K bin packing). Returns a `Shard[]` with zero-padded names and alphabetically-sorted `mutate` lists. `targetLines` is overridable for local sweeps that prefer fewer, larger shards.

## Relationships

- **`scripts/mutation/shard-plan.ts`** — Upstream producer: walks `stryker.json`'s actual `mutate` scope and emits the `{ file, lines }[]` array that `packIntoShards` consumes.
- **`github/workflows/mutation.yml`** — Downstream consumer: iterates over `Shard[].name` as its matrix axis and passes `Shard[].mutate` to Stryker. The workflow's `timeout-minutes` is intended to stay in sync with `TARGET_LINES_PER_SHARD`, but nothing enforces that.
- **`scripts/mutation/run-shards.ts`** / **`scripts/mutation/local-policy.ts`** — Downstream consumers for local execution; they may pass a different `targetLines` to `packIntoShards` to produce fewer, larger shards (avoiding repeated whole-suite dry-run overhead per shard).
- **`tests/unit/scripts/mutation/sharding.test.ts`** — Unit tests for `packIntoShards`.

## Notes

- `TARGET_LINES_PER_SHARD` and the workflow's `timeout-minutes` are a **coupled pair** with no automated check; changing one without the other will cause shards to time out or leave budget wasted.
- The `mutate` string is a flat comma-separated path list, not glob patterns — Stryker's `--mutate` flag expects this shape.
- Bin-packing is intentionally a heuristic (greedy), not an exact partition solver; shard imbalance at the boundaries is expected and acceptable.
- `toSorted` is used (not `sort`), so the input `files` array is never mutated.
