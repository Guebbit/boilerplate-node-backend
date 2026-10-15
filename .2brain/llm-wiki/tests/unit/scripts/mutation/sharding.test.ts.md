---
source: tests/unit/scripts/mutation/sharding.test.ts
sha256: 90c4edeabd62d2f7c49d2cefaea2f3ce4fecd0d48e9aa1e9be26b67be10ab16c
generated_at: 2026-10-15T13:29:05.460350+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/sharding.test.ts

## Purpose

Unit tests for the pure packing logic in `scripts/mutation/sharding.ts`. Verifies that `packIntoShards` correctly partitions a list of files into mutation shards by line count, using synthetic fixtures rather than a real directory walk (the walk half lives in `mutate-scope.ts` and has its own test).

## Key elements

- **`files(...entries)`** — local helper that converts `[name, lines]` tuples into `{ file, lines }` objects so fixtures read like plain pairs.
- **`describe('packIntoShards')`** — six cases:
  - Every file lands in exactly one shard (partition + line-total invariant).
  - An explicit target argument overrides the `TARGET_LINES_PER_SHARD` default.
  - Shard count is `ceil(totalLines / target)`, independent of file count.
  - Lopsided input (one 6000-line file + twenty 50-line files) stays balanced; the asserted ratio ceiling is `6000 / 50`, the huge file's own lines over the smallest possible bin, so the bound is independent of the target constant.
  - No shard is ever empty.
  - Output is deterministic: same input → identical shard list (stable naming).

## Relationships

- **`scripts/mutation/sharding.ts`** — the module under test. Imports `packIntoShards` (the function being verified) and `TARGET_LINES_PER_SHARD` (used to compute the expected shard count in one case).
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — sibling test in the same mutation-test directory; shares the convention of testing the pure-logic half of a script in isolation from its filesystem-walking half.

## Notes

- The default target is 600 lines/shard (referenced in the explicit-target test's comment). The tests never hard-code this; they import `TARGET_LINES_PER_SHARD` where needed so the suite keeps passing if the constant changes.
- The balance test's bound is intentionally derived (`huge / tiny`) rather than a magic number, so it remains valid for any future value of `TARGET_LINES_PER_SHARD`.
- Fixtures use small, hand-written file lists. There is no `fs` or `path` usage in this file.
