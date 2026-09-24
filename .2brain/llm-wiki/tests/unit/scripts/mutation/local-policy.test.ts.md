---
source: tests/unit/scripts/mutation/local-policy.test.ts
sha256: a2a9d9d65ef009d05cfc590caacdeb00738591b174aa34f92316aeb52333a544
generated_at: 2026-09-23T20:31:25.892225+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/mutation/local-policy.test.ts

## Purpose

Unit tests for `selectShards`, the pure decision function that determines which mutation shards to run in a given evening sweep versus which are already completed. It exists so the logic can be verified without invoking the CLI (`run-shards.ts`), which is intentionally kept as a thin, untested wrapper.

## Key elements

- **`shards(...names)`** — local helper that fabricates `Shard` objects from names alone (hardcodes `mutate` and `lines`), keeping the test free of any file-system or mutation-state dependencies.
- **`describe('selectShards')`** — single suite containing five test cases:
  - Filters out shards already recorded as `completed`.
  - Caps the run list to `limit`, leaving the remainder unprocessed.
  - Narrows the candidate set to those named in `only`.
  - With `force: true`, re-runs every shard and reports an empty `done` list.
  - Combines `only` with `completed`: a shard that matches both is treated as done, not run.

## Relationships

- **`scripts/mutation/local-policy.ts`** — the module under test; provides `selectShards` and its input/output types.
- **`scripts/mutation/sharding.ts`** — source of the `Shard` type (a `{ name, mutate, lines }` shape) that the test helper constructs.

## Notes

- The test is deliberately "pure input/output" (per the file header): it never touches disk, calls `mutate`, or reads real shard metadata. This mirrors the convention in the neighboring `sharding.test.ts`.
- `run-shards.ts` is explicitly *not* tested here; it is a thin CLI wrapper by design.
