---
source: tests/unit/scripts/mutation/local-policy.test.ts
sha256: a2a9d9d65ef009d05cfc590caacdeb00738591b174aa34f92316aeb52333a544
generated_at: 2026-11-08T10:39:03.508904+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/local-policy.test.ts

## Purpose

Unit tests for `selectShards`, the pure selection function that decides which shards a sharded mutation sweep should run in the current "evening" versus which are already done. It exists so the selection logic can be verified without spinning up the CLI (`run-shards.ts`) or touching the file system.

## Key elements

- **`shards(...names)`** — local helper that builds minimal `Shard` objects (`{ name, mutate, lines }`) from bare name strings, keeping test fixtures tiny.
- **`describe('selectShards')`** — five test cases covering:
  - Filtering out shards already in `completed`.
  - Capping the run list at `limit` while leaving the remainder outstanding.
  - Narrowing the universe to `only`-named shards.
  - `force: true` re-including already-completed shards and clearing the `done` list.
  - `only` targeting a shard that is *already* completed → nothing to run, shard reported as done.

## Relationships

- **`scripts/mutation/local-policy.ts`** — the module under test; provides `selectShards`.
- **`scripts/mutation/sharding.ts`** — source of the `Shard` type used to shape test fixtures.

## Notes

- The header comment explicitly states this is a "pure input/output" test, mirroring the convention used in the neighboring `sharding.test.ts`.
- `lines` is set to a constant `100` on every fixture shard; the selection logic never reads it. If a future test needs to assert line-count behavior, that constant will need to be parameterized.
- `run-shards.ts` (the CLI entry point that calls `selectShards`) is intentionally **not** tested here or elsewhere — it is treated as a thin, untested wrapper.
