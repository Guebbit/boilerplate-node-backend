---
source: scenarios/index.ts
sha256: 749d3bf768b89018f992ac143d64347b2f1a2c03d0625c6c692aa42be3c698f9
generated_at: 2026-10-29T01:23:31.762534+00:00
model: ollama:qwen3.8:27b
---

# scenarios/index.ts

## Purpose

The scenario registry. It collects every named, whole-database state the repo can seed (`blank` plus the generated scenario fixtures) into a single `SCENARIOS` table and exposes `buildScenario` as the one entry point that seeds a scenario and optionally drives its history flows. It exists so that adding a new scenario touches exactly this file (plus its generated fixture), and so the entire `scenarios/` folder can be stripped from a production image without anything under `src/` noticing.

## Key elements

- **`Scenario` (interface)** — shape of one registry entry: `seed` (writes starting rows into an empty DB), optional `drive` (drives HTTP flows against a base URL and returns extra produced subjects), and `subjects` (pinned name → row-id map).
- **`SCENARIOS` (const)** — the registry table built by spreading `scenarioFixtures` and adding the `blank` entry. Satisfies `Record<string, Scenario>`.
- **`ScenarioName` (type)** — `keyof typeof SCENARIOS`; the set of valid scenario names.
- **`isScenarioName` (type guard)** — narrows an untrusted `string` to `ScenarioName` via `Object.hasOwn`, so callers need no `as` cast.
- **`scenarioOr` (internal)** — returns `preferred` if it is a known scenario, otherwise falls back to `'blank'`.
- **`DEFAULT_SCENARIO` (exported const)** — `scenarioOr('shop')`; resolves to `'shop'` when the generated fixtures carry one, else `'blank'`. Derived, so removing the shop scenario requires no edit here.
- **`buildScenario` (exported function)** — the main consumer-facing API. Seeds the named scenario, then (if `drive` exists and an `Express` app was supplied) runs the flows over a loopback listener with the human-challenge provider disabled. Merges pinned `subjects` with flow-produced extras. Throws if a driving scenario is called without an app.
- **`shopModules` (re-export)** — re-exported from `./shop-modules` so downstream consumers import it from the registry.

## Relationships

- **`scenarios/blank.ts`** — provides `seedBlank`, the seed function for the `blank` entry.
- **`scenarios/scenarios.generated.ts`** — provides `scenarioFixtures`, spread into `SCENARIOS`.
- **`scenarios/flows/loopback.ts`** — provides `withLoopbackServer`, used by `buildScenario` to mount a throwaway listener for flow driving.
- **`scenarios/support/no-human-challenge.ts`** — provides `withoutHumanChallenge`, wrapped around the drive step to disable the challenge provider during scripted flows.
- **`scenarios/seed.ts`** — provides the `SeedOutcome` type used in the `Scenario.seed` signature.
- **`scenarios/shop-modules.ts`** — source of the re-exported `shopModules`.
- **`scenarios/apply.ts`** — indexes `SCENARIOS` directly (documented in the module comment) to apply a scenario by name.
- **`scenarios/support/demo.ts`** — walks `SCENARIOS` to drive the demo profile.
- **`scenarios/check.ts`** — holds a compile-time twin of the module registry and cross-checks `shopModules` names against `enabledModules`; this file cannot perform that check because ESLint boundaries restrict `src/modules.ts` access to `apply.ts` / `run-server.ts` / `check.ts`.
- **`tests/integration/access.test.ts`**, **`tests/integration/scenarios/shop.test.ts`** — integration tests that consume `buildScenario` / `DEFAULT_SCENARIO` to seed and drive scenarios.

## Notes

- **One-way dependency.** Every file in `scenarios/` imports its module's repository, models, and factories directly; nothing under `src/` imports back into this folder. A production build can omit the folder entirely.
- **ESLint boundary.** This file deliberately does *not* import `src/modules.ts`. The `shopModules`-vs-`enabledModules` cross-check lives in `check.ts` for that reason.
- **`app` is optional but conditionally required.** `buildScenario` accepts `app?: Express`; it throws at call time if the scenario has a `drive` function and no app was passed. Scenarios with no history (e.g. `blank`) need no app.
- **`drive` resolves extras, not the full subject set.** Pinned `subjects` are merged with whatever `drive` returns; backdating of written rows must happen inside `drive` before it resolves.
- **`DEFAULT_SCENARIO` is derived, not hardcoded.** It calls `scenarioOr('shop')`, so deleting or renaming the shop scenario in the generated fixtures automatically shifts the default to `blank` with no edit to this file.
