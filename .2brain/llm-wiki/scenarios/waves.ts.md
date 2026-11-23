---
source: scenarios/waves.ts
source_sha256: d3bf55272efdf3b887d6834ab00b8075d313071f4df541214767c68417f2267d
context_sha256: 3773f51dd260fd19bf6146682d72e65134bbff725498932018313010a5b87c08
generated_at: 2026-11-22T01:50:23.081486+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/waves.ts

## Purpose
Generic dependency-wave ordering for a named set of async steps. It lets `scenarios/shop-modules.ts` seed `products` after `locales` without a hand-written special case. A dependency naming a step that isn't in the set is ignored, so a dependency survives its target being deleted without editing the dependent's entry.

## Key elements
- **`WaveEntry<T>`** — interface for one step: `run: () => Promise<T>` and optional `after?: readonly string[]`, the names of other steps in the same set that must settle first.
- **`waveOrder(entries)`** — groups entry names into waves (`string[][]`). All entries in a wave can start together, and each wave waits for every earlier one. It repeatedly picks entries whose `after` names are no longer remaining, and throws an `Error` ("scenario wave order: a cycle involves …") if none are ready, which means a cycle.
- **`runInWaves(entries)`** — calls `waveOrder`, then runs each wave's steps concurrently with `Promise.all` and the waves sequentially. It returns all results flattened in wave order. Order within a wave is not guaranteed to be meaningful.

## Relationships
- `scenarios/shop-modules.ts` is the documented consumer, using this ordering to seed `products` after `locales`.
- `tests/unit/scenarios/waves.test.ts` is the unit test for this module.
- `scenarios/blank.ts` and `scenarios/shop.scenario.ts` are graph neighbors. This file shows no direct interaction with them.

## Notes
- A dangling `after` name (not a key of `entries`) is inert and never causes an error.
- Only cycles throw. A self-reference or mutual dependency is reported as a cycle among the remaining names.
- `runInWaves` uses a plain `for` loop with `await` rather than `.reduce()` chaining, by design.
- If a step rejects, `Promise.all` rejects and later waves don't run. The file adds no extra error handling.
