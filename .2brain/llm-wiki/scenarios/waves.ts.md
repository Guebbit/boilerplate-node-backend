---
source: scenarios/waves.ts
sha256: 059a8acde6b61eba9fac819746e3c12f99b7b9620326ba5d8dc8ec9ae010a069
generated_at: 2026-10-14T07:07:08.608454+00:00
model: ollama:qwen3.8:27b
---

# scenarios/waves.ts

## Purpose

Provides a generic dependency-wave scheduler that groups a named set of async steps into the fewest sequential "waves" (waves run in order; steps within a wave run concurrently). It exists so scenario seed scripts can declare *what* each step depends on by name rather than hard-coding a fixed execution order, allowing steps to be added or removed without editing their dependents.

## Key elements

- **`WaveEntry<T>`** (interface) — Describes one step: a `run` async function and an optional `after` array of names (from the same set) that must settle first.
- **`waveOrder<T>(entries)`** — Pure function that topologically sorts entries into `string[][]` waves. A name listed in `after` but absent from the set is treated as already-satisfied (inert). Throws if the remaining entries form an unresolvable cycle.
- **`runInWaves<T>(entries)`** — Calls `waveOrder`, then executes each wave via `Promise.all`. Returns all step results concatenated in wave order (order *within* a wave is not guaranteed).

## Relationships

- **`scenarios/shop-modules.ts`** — Primary consumer; uses this module to seed dependent entities (e.g. `products` after `locales`) without a hand-ordered list.
- **`scenarios/index.ts`** — Barrel/entry point that re-exports this module's public API for the rest of the scenario suite.
- **`tests/unit/scenarios/waves.test.ts`** — Unit tests covering wave ordering, dangling-dependency tolerance, and cycle detection.

## Notes

- **Dangling `after` names are silently ignored**, not an error. This is the mechanism that lets you delete a step without editing every step that listed it in `after`.
- **Cycle detection is fail-fast**: if a wave produces no ready entries, `waveOrder` throws listing the remaining names. There is no timeout or partial execution.
- **Order within a wave is non-deterministic** (`Promise.all` + array spread). Consumers that need intra-wave ordering must add an explicit `after` edge.
- The executor is deliberately a `for…of` + `await` loop rather than a `.reduce()`/`.then()` chain, per the in-file comment.
