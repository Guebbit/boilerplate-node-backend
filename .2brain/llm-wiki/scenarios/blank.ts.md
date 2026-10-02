---
source: scenarios/blank.ts
sha256: 7dfe5d6c04bfa664b7222c246e48f6f76959d0b115b54f16dc8b5fdf422e48d6
generated_at: 2026-10-01T12:20:23.217059+00:00
model: ollama:qwen3.8:27b
---

# scenarios/blank.ts

## Purpose

Defines the **blank** scenario: a minimal seed that establishes only harness infrastructure (access model, named accounts, baseline shop modules such as locales) with no catalogue, orders, or carts. It is the restore target for behaviour e2e specs that create and assert their own data, as opposed to the full `shop` scenario.

## Key elements

- **`seedBlank`** (exported `Promise<SeedOutcome[]>`) — Orchestrates the blank seed in two phases: first `seedAccessModel`, then concurrently `seedNamedUsersCollection` and `runInWaves(asWaveEntries(baselineShopModules()))`. Flattens and concatenates the two result sets.

## Relationships

- **`scenarios/accounts.ts`** — Calls `seedAccessModel()` first, because roles and shop membership must exist before any caller can be resolved.
- **`scenarios/users.ts`** — Calls `seedNamedUsersCollection()` concurrently with the baseline modules (neither reads the other's writes).
- **`scenarios/shop-modules.ts`** — Calls `baselineShopModules()` to obtain the set of modules marked `baseline`, then wraps them via `asWaveEntries` for wave-based execution.
- **`scenarios/waves.ts`** — Calls `runInWaves(...)` to execute the baseline module entries.
- **`scenarios/seed.ts`** — Imports the `SeedOutcome` type used as the return element.
- **`scenarios/index.ts`** — Reads `seedBlank` from its `SCENARIOS` registry; this file is never invoked directly.

## Notes

- **Ordering constraint:** `seedAccessModel` must complete before the concurrent phase begins; the two concurrent tasks are safe to run together because neither reads the other's writes.
- **Baseline coupling:** The baseline module set is derived from `shop-modules.ts` rather than hardcoded here, keeping `blank` in step with `shop` without either scenario importing the other.
- **Indirect invocation:** `seedBlank` is consumed exclusively through the registry in `scenarios/index.ts`; call sites should go through that registry.
