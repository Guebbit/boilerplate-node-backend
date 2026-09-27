---
source: scenarios/index.ts
sha256: 67eba58c38f0389b228b1381d357c97249e8780aa1f7e62b4e9d0c742bfd2780
generated_at: 2026-09-27T13:50:10.590529+00:00
model: ollama:qwen3.8:27b
---

# scenarios/index.ts

## Purpose

The scenario registry: the single place that names every whole-database state this repo can seed (`shop`, `blank`) and exposes one function (`buildScenario`) that seeds, optionally drives live HTTP flows, and backdates the resulting history. It exists so that callers (`src/app/demo.ts`, `scenarios/apply.ts`) index a table instead of branching, and so that adding a scenario is a one-file change.

## Key elements

- **`SCENARIOS`** – The registry object (`satisfies Record<string, Scenario>`). Maps scenario names to their `seed`, optional `drive`, and pinned `subjects`. Currently holds `shop` and `blank`.
- **`ScenarioName`** – `keyof typeof SCENARIOS`; the closed set of valid names.
- **`DEFAULT_SCENARIO`** – `'shop'`; the fallback when no name is supplied.
- **`isScenarioName(name)`** – Type guard (`name is ScenarioName`) so callers never need a manual `as ScenarioName` cast after an `Object.hasOwn` check.
- **`buildScenario(name, app?)`** – The single public entry point. Seeds rows, optionally drives the scenario's HTTP history against a loopback listener, backdates produced orders, and returns the merged subject-id map. Throws if a scenario needs `drive` but no Express app was passed.
- **`seedShop()`** (internal) – Seeds the access model first, then runs every `shopModules` entry in dependency-ordered waves via `runInWaves`.
- **`Scenario` interface** (internal) – Shapes each registry entry: `seed`, optional `drive`, and `subjects`.
- **Re-export of `shopModules`** – Convenience so external consumers can reach the per-module fixture table without importing `./shop-modules` directly.

## Relationships

- **`scenarios/shop-modules.ts`** – Supplies the `shopModules` array and `asWaveEntries` helper consumed by `seedShop`; also re-exported here.
- **`scenarios/waves.ts`** – Provides `runInWaves`, the executor that resolves the `after`-dependency graph of module entries into sequential waves.
- **`scenarios/accounts.ts`** – Provides `seedAccessModel`, which `seedShop` calls before any module seeding.
- **`scenarios/blank.ts`** – Provides `seedBlank`, the seed function registered under `SCENARIOS.blank`.
- **`scenarios/subjects.ts`** – Provides `SHOP_SUBJECTS`, the pinned name→id map for the shop scenario.
- **`scenarios/seed.ts`** – Provides the `SeedOutcome` type used in `Scenario.seed`'s return.
- **`scenarios/flows/loopback.ts`** – Provides `withLoopbackServer`, which `buildScenario` uses to stand up a throwaway HTTP listener for driving.
- **`scenarios/flows/shop-history.ts`** – Provides `driveShopHistory` (registered as `SCENARIOS.shop.drive`) and the `ShopHistory` type.
- **`scenarios/flows/backdate.ts`** – Provides `backdateHistory`, called after driving to move orders into the past.
- **`scenarios/check.ts`** – Holds a compile-time mirror of the module registry; cross-validates that every `shopModules` entry name also appears in `enabledModules`. This file cannot perform that check itself due to ESLint boundary rules.
- **`scenarios/apply.ts`** – A consumer that indexes `SCENARIOS` to apply a scenario; does not import any module for any other reason.
- **`src/app/demo.ts`** – A consumer that indexes `SCENARIOS` for the demo server; same non-import contract as `apply.ts`.
- **`tests/integration/access.test.ts`** – Exercises the access-model seeding path (via `seedAccessModel` in `accounts.ts`) that this file orchestrates.
- **`tests/integration/scenarios/shop.test.ts`** – Integration tests for the shop scenario end-to-end (seed → drive → backdate).

## Notes

- **Dependency direction is one-way.** Every file in `scenarios/` imports from `src/`; nothing under `src/` imports back into `scenarios/`. A production image can ship without this folder and `src/` is unaffected.
- **ESLint boundary rule.** Only `apply.ts`, `run-server.ts`, and `check.ts` may reach into `src/modules.ts`. This file deliberately does not, which is why the compile-time cross-check lives in `check.ts` rather than here.
- **`buildScenario` assumes an empty database.** The caller is responsible for clearing the schema before invoking it.
- **`app` is optional** precisely so the `blank` scenario (no `drive`) can be built by a caller that has not yet assembled an Express instance.
- **Waves guarantee ordering.** Within `seedShop`, the access model always runs first; among `shopModules`, the `after` graph (resolved by `runInWaves`) determines wave placement—e.g. `products` waits for `locales`.
