---
source: scenarios/index.ts
sha256: 749d3bf768b89018f992ac143d64347b2f1a2c03d0625c6c692aa42be3c698f9
generated_at: 2026-11-08T02:30:04.701833+00:00
model: ollama:qwen3.8:27b
---

# scenarios/index.ts

## Purpose

Central registry of every named, whole-database state the repo can seed (`blank` plus each generated scenario). It bundles seeding and optional flow-driving into a single `buildScenario` entry point so that adding a new scenario requires editing exactly one place. Lives at the bottom of the dependency tree: production code under `src/` never imports it (enforced by ESLint boundaries), allowing the entire `scenarios/` folder to be omitted from a production image.

## Key elements

- **`Scenario` (interface)** — shape of one entry: `seed()` (write starting rows into an *empty* DB), optional `drive(baseUrl)` (live the history over HTTP, resolving extra subject ids), and `subjects` (name → row id for pinned rows).
- **`SCENARIOS`** — the registry object: spreads `scenarioFixtures` (from `scenarios.generated`) and adds the hardcoded `blank` entry.
- **`ScenarioName`** — `keyof typeof SCENARIOS`; the set of valid scenario names.
- **`isScenarioName(name)`** — type-guard (`name is ScenarioName`) so callers narrow without an `as` cast.
- **`DEFAULT_SCENARIO`** — `'shop'` if the registry carries it, else `'blank'`. Derived via `scenarioOr('shop')`, so deleting the shop scenario file automatically falls back.
- **`buildScenario(name, app?)`** — the single public entry point. Seeds the DB, then (if the scenario has a `drive`) spins up a throwaway loopback Express listener with the human-challenge provider disabled, runs the flows, and merges pinned + produced subjects. Throws if `drive` exists but `app` was not supplied.
- **`shopModules`** — re-exported from `./shop-modules`; the catalogue module list used by `check.ts` and deployment tooling.

## Relationships

- **`scenarios/blank.ts`** — provides `seedBlank`, the only hardcoded scenario entry.
- **`scenarios/scenarios.generated`** — provides `scenarioFixtures` (one entry per `*.scenario.ts` file); this file is the single consumer.
- **`scenarios/flows/loopback.ts`** — provides `withLoopbackServer`, used inside `buildScenario` to drive HTTP flows against the Express app.
- **`scenarios/support/no-human-challenge.ts`** — provides `withoutHumanChallenge`, wrapped around the drive phase because scripted flows cannot solve CAPTCHAs.
- **`scenarios/seed.ts`** — source of the `SeedOutcome` type used in the `Scenario.seed` signature.
- **`scenarios/shop-modules.ts`** — re-exported; its `shopModules` entries are cross-checked against `enabledModules` by `scenarios/check.ts`.
- **`scenarios/check.ts`** — holds a compile-time twin of this registry; rejects any `shopModules` name absent from `enabledModules`. Cannot live in this file because only `check.ts`, `apply.ts`, and `run-server.ts` may reach `src/modules.ts` (ESLint boundary).
- **`scenarios/apply.ts` / `scenarios/support/demo.ts`** — the two runtime consumers that index `SCENARIOS` instead of hand-rolling conditionals.
- **`tests/integration/access.test.ts` / `tests/integration/scenarios/shop.test.ts`** — integration tests that exercise seeded scenarios through this registry.

## Notes

- `seed()` assumes a **completely empty** database; the caller is responsible for emptying it first. `buildScenario` does not empty for you.
- `drive` is optional. A scenario with no history (like `blank`) can be built without an Express app. `buildScenario` throws if a *driven* scenario is requested without one.
- `drive` may backdate the rows it wrote; that happens *inside* the `drive` implementation before it resolves, not as a separate post-step.
- `DEFAULT_SCENARIO` is not a constant string — it is computed from the registry at module-load time. If the generated shop scenario is removed, it silently becomes `'blank'` with no code edit needed.
- The entire `scenarios/` folder is **dev/test-only**. ESLint boundaries in `eslint.config.ts` prevent any `src/` module from importing it, so a production build can exclude the folder with no compilation impact.
