---
source: tests/unit/scripts/mutation/sharding.test.ts
sha256: 90c4edeabd62d2f7c49d2cefaea2f3ce4fecd0d48e9aa1e9be26b67be10ab16c
generated_at: 2026-11-08T10:39:22.522604+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/sharding.test.ts

## Purpose

Unit tests for `packIntoShards` in `scripts/mutation/sharding.ts`. It verifies that the local full-sweep sharding logic distributes synthetic `{file, lines}` lists into balanced, deterministic shards, using only in-memory fixtures and never a real directory walk (that half lives in `mutate-scope.ts` and is tested separately).

## Key elements

- **`files(...entries)`** — local helper that maps `[name, lines]` tuples into the `{ file, lines }` shape expected by `packIntoShards`, keeping fixtures readable.
- **`describe('packIntoShards')`** — six test cases:
  - *Completeness:* every input file lands in exactly one shard; total line count is preserved.
  - *Explicit target:* passing `2500` overrides the default and yields fewer shards than the default would.
  - *Target-driven count:* shard count is `Math.ceil(totalLines / TARGET_LINES_PER_SHARD)`, independent of file count.
  - *Lopsided balance:* one 6 000-line file plus 20 × 50-line files — asserts max/min shard ratio ≤ 6000/50, the ceiling set by the un-splittable huge file.
  - *No empty shards:* a single-file input still produces a non-empty `mutate` list.
  - *Determinism:* identical input yields structurally equal output (same shard names and file lists).

## Relationships

- **`scripts/mutation/sharding.ts`** — the module under test. This file imports `packIntoShards` (the function under test) and `TARGET_LINES_PER_SHARD` (used to compute the expected shard count in the "target-driven count" test).
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — sibling test file noted in the header comment as following the same test-split convention: the pure-function half is tested here, while the directory-walk half (`mutate-scope.ts`) gets its own test, mirroring the `check-baseline.ts` / `baseline.ts` split in the same directory.

## Notes

- Fixtures are always synthetic arrays; no `fs` or `glob` calls appear. This is intentional — the header comment flags the split from `mutate-scope.ts`.
- The lopsided-balance assertion uses the ratio `6000 / 50` (i.e. the huge file's lines ÷ one tiny file's lines) rather than a hardcoded number, so it stays correct if `TARGET_LINES_PER_SHARD` changes.
- The comment references a real incident: a single module (`account`) previously dominated the mutation matrix wall clock. The balance test exists specifically to guard against that regression.
