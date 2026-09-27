---
source: scenarios/waves.ts
sha256: 43e5ff74cb386af92ab24bb3e115b3ea88cbd5114189b9b087fe9f858d23c7bf
generated_at: 2026-09-27T13:52:01.017186+00:00
model: ollama:qwen3.8:27b
---

# scenarios/waves.ts

## Purpose

Provides a generic dependency-wave scheduler for a named set of async steps. Each step declares which *other* steps in the same set it must wait for; the module groups them into waves that run concurrently internally and sequentially across waves. Exists so that `scenarios/shop-modules.ts` can order seeding steps (e.g., products after locales) without hand-maintained "this goes first" special cases, and so a step's dependency can be deleted without breaking the remaining set.

## Key elements

- **`WaveEntry<T>`** — interface for one named step: a `run: () => Promise<T>` and an optional `after?: readonly string[]` listing same-set names it must wait for.
- **`waveOrder<T>(entries)`** — computes the wave grouping (an array of name-arrays). Iteratively collects "ready" entries whose `after` dependencies are all already done or absent from the set. Throws if a cycle leaves entries permanently unresolvable.
- **`runInWaves<T>(entries)`** — calls `waveOrder`, then for each wave awaits `Promise.all` of that wave's `run()` calls and appends results. Returns a flat `T[]` in wave order.

## Relationships

- **`scenarios/shop-modules.ts`** — primary consumer; uses the wave mechanism to seed data (products after locales) with automatic dependency tracking.
- **`tests/unit/scenarios/waves.test.ts`** — unit tests for `waveOrder` and `runInWaves`.

## Notes

- A name in `after` that is **not** a key of the `entries` record is silently ignored (not an error). This is intentional: it lets a dependency survive its target's deletion without editing the dependent step.
- Cycle detection is structural (no wave can form → throw). The error message lists the stuck names.
- `runInWaves` deliberately uses a `for`-loop with sequential `await` per wave rather than a `.reduce()`/`.then()` chain, for readability.
- Result order within a single wave follows the `ready` array order (insertion order of the source `Record`), not any semantic priority.
