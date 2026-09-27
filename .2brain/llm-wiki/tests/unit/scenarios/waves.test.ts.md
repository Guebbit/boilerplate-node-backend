---
source: tests/unit/scenarios/waves.test.ts
sha256: 72fb76ca1c982778256b720451bf21cb83c44a30ba77a97e4e40b30d5da88aa9
generated_at: 2026-09-27T16:12:50.247777+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/waves.test.ts

## Purpose

Unit tests for the wave-scheduling functions exported by `scenarios/waves.ts`. Verifies that `waveOrder` groups entries into correct execution waves based on their `after` dependencies, and that `runInWaves` executes those waves sequentially and returns flattened results. Uses hand-made entries (no database) to isolate ordering logic.

## Key elements

- **`recording(log, name, after?)`** — local helper that builds a `WaveEntry<string>` whose `run` pushes `name` into a shared `log` array and resolves with it. Used to observe actual execution order.
- **`describe('waveOrder', …)`** — five cases:
  - Entry with no `after` lands in wave 1.
  - Entry depending on another lands one wave later.
  - Independent entries share the same wave.
  - An `after` name absent from the entries table is treated as already satisfied (not an error).
  - A cycle (`a → b → a`) causes `waveOrder` to throw, with the message naming every stuck entry.
- **`describe('runInWaves', …)`** — two cases:
  - A dependent entry executes only after its dependency's wave resolves (order verified via shared log).
  - The resolved value is the flat concatenation of all waves' results in wave order.

## Relationships

- **`scenarios/waves.ts`** (the sole import source): provides `runInWaves`, `waveOrder`, and the `WaveEntry` type. This file exercises all three; no other modules are involved.

## Notes

- A missing name in an entry's `after` list is **intentionally** not an error — the dependency is considered already satisfied. This is called out in a comment referencing property `LOCALES_OPTIONAL_0925` step 4 (deleting a producer entry must not require editing its dependents).
- The cycle-detection test matches `/a, b|b, a/` because the implementation may report the stuck entries in either order.
- `recording` takes a `readonly string[]` for the `after` field but the log parameter is a mutable `string[]` — the shared-mutable-array pattern is the only cross-test-observation mechanism here.
