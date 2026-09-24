---
source: scenarios/index.ts
sha256: 7ffce7edac46d28758ecf2a191425f684d1f858cf3aca9c52351d1fe148d8685
generated_at: 2026-09-23T17:18:31.423866+00:00
model: ollama:qwen3.8:27b
---

# scenarios/index.ts

## Purpose
The scenario registry: the single place that names every whole-database state this repo can seed (`shop`, `blank`) and the per-module fixture table the `shop` scenario uses. `app/demo.ts` and `scenarios/apply.ts` both index `SCENARIOS` rather than hand-rolling branches, so adding a scenario touches exactly this file.

## Key elements
- **`shopModules`** – Object mapping module names (`addresses`, `locales`, `products`, `users`, `webhooks`, `wishlist`) to their collection-seed functions. Intentionally untyped so `keyof typeof shopModules` yields literal keys for `check.ts`'s compile-time check.
- **`seedShop`** *(internal)* – Sequences the shop's starting rows: access model first, then `locales` alone, then all remaining modules concurrently.
- **`Scenario`** *(interface)* – Shape every entry in `SCENARIOS` must satisfy: `seed`, optional `drive`, and `subjects`.
- **`SCENARIOS`** – The named registry (`shop`, `blank`), each wired to its seed/drive/subjects.
- **`ScenarioName`** – `keyof typeof SCENARIOS`; the union of valid names.
- **`DEFAULT_SCENARIO`** – `'shop'`; the fallback when no scenario is specified.
- **`isScenarioName`** – Type guard that narrows an untrusted string to `ScenarioName` via `Object.hasOwn`, eliminating the need for `as` casts in callers.
- **`buildScenario`** – The primary exported entry point: seeds a named scenario into an empty DB, optionally drives its flow history against a loopback server (given an Express app), backdates the produced history, and returns all subject IDs.

## Relationships
- **Imports seed functions from sibling modules:** `./addresses`, `./locales`, `./products`, `./users`, `./webhooks`, `./wishlist`, `./blank`, `./accounts`.
- **Imports flow helpers from `./flows/`:** `withLoopbackServer` (`loopback.ts`), `driveShopHistory` + `ShopHistory` type (`shop-history.ts`), `backdateHistory` (`backdate.ts`).
- **Imports `SeedOutcome` type** from `@scenarios/seed`.
- **Consumed by:** `scenarios/apply.ts` and `src/app/demo.ts` (they index `SCENARIOS` / call `buildScenario`).
- **Checked by:** `scenarios/check.ts` (compile-time verification that every `shopModules` key also appears in `enabledModules` from `src/modules.ts`).
- **Directional rule:** files in this folder import from `src/` but never the reverse, allowing a production image to omit the folder entirely.

## Notes
- **`locales` ordering is mandatory, not stylistic.** `products.seed()` writes translations via `planTranslations`, which requires every locale (including the fallback) to already exist as an ACTIVE row. A `Promise.all` over all modules would race them; hence `locales` is seeded in its own `.then` before the concurrent batch.
- **`seedAccessModel` runs before any module.** A caller cannot resolve a user until a shop (and its membership) exists.
- **`shopModules` has no explicit type.** Annotating it would widen keys to `string`, breaking the literal-key inspection `check.ts` performs.
- **`buildScenario` is one function, not three exports.** The seed → drive → backdate ordering is the only valid sequence; splitting it would make invalid orderings callable.
- **`app` parameter is optional** specifically so `blank` (which has no `drive`) can be built by callers that have not assembled an Express app.
