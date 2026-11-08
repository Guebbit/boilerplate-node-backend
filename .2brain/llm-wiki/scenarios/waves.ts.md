---
source: scenarios/waves.ts
sha256: 059a8acde6b61eba9fac819746e3c12f99b7b9620326ba5d8dc8ec9ae010a069
generated_at: 2026-11-08T02:36:28.194240+00:00
model: ollama:qwen3.8:27b
---

# scenarios/waves.ts

## Purpose

Provides a generic topological-sort-and-execute utility for a named set of async steps. It lets callers (e.g. `scenarios/shop-modules.ts`) declare "step B runs after step A" as data rather than hard-coding sequential awaits, so adding or removing a dependency is a one-line change to the entry list—no cascading edits.

## Key elements

- **`WaveEntry<T>`** (interface) — Describes one named step: a `run: () => Promise<T>` function plus an optional `after?: readonly string[]` listing the names of *other* entries in the same set that must settle first.
- **`waveOrder<T>(entries)`** — Pure function. Returns `string[][]`: entry names grouped into sequential waves. Within a wave every step is independent; across waves, each wave depends on all prior waves. Throws an `Error` if `after` references form a cycle. Names listed in `after` that are not themselves keys of `entries` are silently ignored (dangling-reference resilience).
- **`runInWaves<T>(entries)`** — Async. Calls `waveOrder`, then iterates waves with `for…of` + `await Promise.all(…)`. Returns every step's result flattened in wave order (order *within* a wave is non-deterministic).

## Relationships

- **`scenarios/shop-modules.ts`** — Primary consumer; uses `runInWaves` to seed `products` after `locales` without a hand-written special case (referenced in the module doc-comment).
- **`tests/unit/scenarios/waves.test.ts`** — Unit tests for `waveOrder` and `runInWaves`.

## Notes

- A dangling `after` entry (name not present in the set) is **inert by design**, not a bug—this is what makes deleting a target step require no edit to its dependents.
- `runInWaves` deliberately uses a `for…of` loop over waves rather than `.reduce()`/promise-chain; the several sequential `await` reads are the intended readability trade-off.
- Results within a single wave are **not** guaranteed to preserve insertion order—only wave-level ordering is stable.
