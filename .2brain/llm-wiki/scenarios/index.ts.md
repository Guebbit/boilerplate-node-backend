---
source: scenarios/index.ts
sha256: be49602dfffd22c2e43e3e55d80ecbd5cffdd52dd5b19e2efdcf8186e35b2efd
generated_at: 2026-10-01T12:22:04.318446+00:00
model: ollama:qwen3.8:27b
---

# scenarios/index.ts

## Purpose

The scenario registry: the single file that defines every named, whole-database seed state this repo can build, exposes the unified `buildScenario` entry point, and re-exports the `shopModules` table. It exists so that adding a new scenario touches exactly one place, and so that `src/app/demo.ts` and `scenarios/apply.ts` can index scenarios without hand-rolled conditionals.

## Key elements

- **`seedShop`** (internal) — Seeds the shop's starting rows: the access model first, then all `shopModules` entries in the fewest sequential waves their `after` graph permits. Products start at `onHand: 0`; delivery arrives via the flow run.
- **`Scenario`** (interface) — Shape each registry entry must satisfy: `seed()` (requires an empty DB), optional `drive(baseUrl)` (HTTP flows that produce a `ShopHistory`), and `subjects` (pinned name→row-id map).
- **`SCENARIOS`** — The registry object (`shop`, `blank`), constrained with `satisfies Record<string, Scenario>`.
- **`ScenarioName`** — `keyof typeof SCENARIOS`; the closed set of valid names.
- **`DEFAULT_SCENARIO`** — `'shop'`; the fallback when a caller names no scenario.
- **`isScenarioName(name)`** — Type guard narrowing an arbitrary string to `ScenarioName`, so callers never need an `as` cast.
- **`buildScenario(name, app?)`** — The public entry point. Seeds the scenario, optionally drives its HTTP flows against a throwaway loopback listener (with the human-challenge provider disabled), then backdates any produced history. Returns the merged subject map (pinned + flow-produced). Throws if a driving scenario is given without an Express app.
- **`shopModules`** — Re-exported from `./shop-modules` for consumers that need the per-module fixture table directly.

## Relationships

- **Imports from** `./shop-modules`, `./waves`, `./blank`, `./accounts`, `./subjects`, `./flows/loopback`, `./support/no-human-challenge`, `./flows/shop-history`, `./flows/backdate`, and `@scenarios/seed` (type only).
- **Walked by** `src/app/demo.ts` and `scenarios/apply.ts` — neither imports any other module in this folder for a different reason.
- **Compile-time twin in** `scenarios/check.ts` — that file cross-validates `shopModules` names against `enabledModules` in `src/modules.ts`, a check this file cannot perform because eslint boundaries restrict access to `src/modules.ts` to `apply.ts`, `run-server.ts`, and `check.ts` only.
- **Consumed by** `tests/integration/access.test.ts` and `tests/integration/scenarios/shop.test.ts`.

## Notes

- Dependency direction is strict: every file in `scenarios/` imports from `src/`, never the reverse. A production Docker image can exclude the entire `scenarios/` folder with zero impact on `src/`.
- `seed()` assumes an already-empty database; the caller is responsible for truncation.
- `buildScenario`'s three-step order (seed → drive → backdate) is the only legitimate sequence and is deliberately fused into one function rather than exported as three steps.
- The `app` parameter is optional precisely so `blank` (which has no `drive`) can be built by callers that have not yet assembled an Express instance.
