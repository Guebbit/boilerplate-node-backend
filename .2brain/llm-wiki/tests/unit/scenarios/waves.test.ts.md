---
source: tests/unit/scenarios/waves.test.ts
sha256: c6a3c382fecee6dc044a5b308c6edc387ed38462f3274779bf2be6b0a2a5f84f
generated_at: 2026-11-08T10:31:03.328562+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/waves.test.ts

## Purpose

Unit tests for the wave-scheduler API exported by `scenarios/waves.ts`. Verifies both the pure ordering logic (`waveOrder`) and the async execution semantics (`runInWaves`) using hand-made entries with no database or external I/O.

## Key elements

- **`recording(log, name, after?)`** — local helper that builds a `WaveEntry<string>` whose `run` pushes `name` into a caller-supplied shared `string[]` log, then resolves with `name`. Used by every test to observe execution order.
- **`describe('waveOrder')`** — tests the synchronous wave-partitioning function:
  - No-dep entry lands in wave 0.
  - A dependent entry is placed in the wave *after* its dependency.
  - Independent entries share the same wave.
  - An `after` name absent from the table is silently satisfied (not a missing-reference error).
  - A cycle throws an error whose message names every stuck entry.
- **`describe('runInWaves')`** — tests the async runner:
  - Later waves start only after earlier waves settle (order verified via shared log).
  - Resolves to a flat array of all results in wave order.

## Relationships

- **`scenarios/waves.ts`** — the module under test. Imports `runInWaves`, `waveOrder`, and the `WaveEntry` type. All assertions target these three exports.

## Notes

- The test file intentionally mirrors the pattern used by `check.test.ts` (hand-made inputs, no DB) — the scheduler is a pure ordering/execution function over caller-supplied entries.
- The "absent `after` name" test encodes a deliberate design contract: removing an entry from the table never breaks a dependent's `after` list. This is not an edge case; it's the expected deletion-safety guarantee.
- Cycle-detection error message is asserted with a regex (`/a, b|b, a/`) rather than an exact string, allowing either ordering of the stuck names.
