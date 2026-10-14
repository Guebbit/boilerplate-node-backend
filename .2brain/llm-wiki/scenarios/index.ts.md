---
source: scenarios/index.ts
sha256: 856d6923aefd4d12a5ff5aa8cc617e9fcda606947bfb5ce6dc9ff396160c3b8b
generated_at: 2026-10-14T06:58:45.636743+00:00
model: ollama:qwen3.8:27b
---

# scenarios/index.ts

## Purpose

Central registry of all named, whole-database scenarios this repo can seed. It defines the `Scenario` shape (seed → drive → subjects), exposes a single `buildScenario` entry point, and lets callers (`apply.ts`, `support/demo.ts`) index one table instead of hand-rolling per-scenario conditionals. Every file in the `scenarios/` folder imports its own dependencies directly so a production image can drop the entire folder without anything under `src/` noticing.

## Key elements

- **`SCENARIOS`** – `Record<string, Scenario>` table mapping `"shop"` and `"blank"` to their `{ seed, drive?, subjects }`. The single place a new scenario is registered.
- **`ScenarioName`** – `keyof typeof SCENARIOS`; the closed set of valid names.
- **`DEFAULT_SCENARIO`** – `"shop"`; the fallback when no name is supplied.
- **`isScenarioName(name)`** – type-guard narrowing an unvalidated string to `ScenarioName`, so callers avoid a manual `as` cast.
- **`buildScenario(name, app?)`** – the one-call lifecycle: seed → drive (against a loopback listener, human-challenge disabled) → backdate. Returns merged subject ids (pinned + flow-produced). Throws if a drive-capable scenario is given without an Express app.
- **`seedShop`** (internal) – seeds the access model first, then all `shopModules` entries via `runInWaves(asWaveEntries(shopModules))`, guaranteeing `products` waits for `locales`.
- **`shopModules`** – re-exported from `./shop-modules` so external consumers import it from here.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scenarios/shop-modules.ts` | Supplies `shopModules` (fixture table) and `asWaveEntries` (wave graph). |
| `scenarios/waves.ts` | Supplies `runInWaves`, the sequential-wave executor. |
| `scenarios/accounts.ts` | Supplies `seedAccessModel`, the first step of `seedShop`. |
| `scenarios/blank.ts` | Supplies `seedBlank` for the `blank` scenario. |
| `scenarios/subjects.ts` | Supplies `SHOP_SUBJECTS` (pinned name→id map). |
| `scenarios/flows/loopback.ts` | Supplies `withLoopbackServer`, the temporary HTTP listener for drive. |
| `scenarios/support/no-human-challenge.ts` | Supplies `withoutHumanChallenge`, disabling the challenge provider during drive. |
| `scenarios/flows/shop-history.ts` | Supplies `driveShopHistory` and the `ShopHistory` type. |
| `scenarios/flows/backdate.ts` | Supplies `backdateHistory`, moving orders into the past after drive. |
| `scenarios/seed.ts` | Supplies the `SeedOutcome` type used in signatures. |
| `scenarios/check.ts` | Compile-time twin: validates every `shopModules` key against `enabledModules` in `src/modules.ts`. `index.ts` cannot perform this check itself due to eslint boundary rules. |
| `scenarios/apply.ts` | Primary consumer; indexes `SCENARIOS` and calls `buildScenario`. |
| `scenarios/support/demo.ts` | Consumes `SCENARIOS` to walk and display scenario metadata. |
| `tests/integration/access.test.ts` | Exercises seeded access-model rows via `buildScenario`. |
| `tests/integration/scenarios/shop.test.ts` | Drives the full shop scenario end-to-end. |

## Notes

- **Dependency boundary:** only `apply.ts`, `run-server.ts`, and `check.ts` may import `src/modules.ts`. That is why the `shopModules` ↔ `enabledModules` name-consistency check lives in `check.ts`, not here.
- **`blank` has no `drive`**, so `buildScenario("blank")` works without an Express app—pass `app` as `undefined`.
- **Products start at `onHand: 0`.** A seeded-but-undriven shop has an empty catalogue; inventory only appears after the drive/backdate cycle in `buildScenario`.
- **Caller owns the empty database.** `seed` assumes a clean slate; `buildScenario` does not drop tables itself.
