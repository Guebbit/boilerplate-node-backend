---
source: scenarios/check.ts
sha256: e48ae4c2325e1f3c86aaf86d19a9f407519c26f73e5fc07c8e0f2c8ef88e477b
generated_at: 2026-09-23T17:17:10.407672+00:00
model: ollama:qwen3.8:27b
---

# scenarios/check.ts

## Purpose

Verifies that a scenario's declared guarantees (each module's `AppModule.scenario` entries) exactly match the subjects the scenario actually seeds (the id map from `buildScenario`). Checks both directions: a guarantee with no seeded row, and a subject no enabled module declares. Runs at test time as a tripwire and at compile time for module mounting.

## Key elements

- **`ShopModulesAreMounted`** (type, internal) — compile-time constraint: `keyof typeof shopModules` must be assignable to `ModuleName`. A `never` result produces a build error naming the offending key.
- **`shopModulesAreMounted`** (const, internal) — assigns `true` to the type above to force TypeScript to evaluate it. Never read at runtime; exists solely to trigger the check.
- **`findUnmetGuarantees(scenarioName, subjects)`** (exported) — compares the union of `enabledModules[*].scenario[scenarioName]` against the keys of `subjects`. Returns an array of human-readable problem strings (empty when they agree).
- **`assertScenarioGuarantees(scenarioName, subjects)`** (exported) — calls `findUnmetGuarantees`; throws a single `Error` listing every mismatch if any exist. The shape `shop.test.ts` expects.

## Relationships

- **`src/modules.ts`** — imports `enabledModules` and `ModuleName`. This file is one of three (alongside `apply.ts` and `run-server.ts`) permitted by the eslint boundaries to reach this module.
- **`scenarios/index.ts`** — imports `shopModules` (type-only) for the compile-time check. At runtime the test passes in the `subjects` map that `buildScenario` (defined there) produces.
- **`tests/integration/scenarios/shop.test.ts`** — calls `assertScenarioGuarantees` immediately after building the shop scenario to fail fast on any drift.
- **`tests/unit/scenarios/check.test.ts`** — unit-tests `findUnmetGuarantees` against hand-crafted subject maps to prove it catches both mismatch directions.

## Notes

- `findUnmetGuarantees` deliberately takes `subjects` as a parameter rather than building the scenario itself, so the checker can be validated against arbitrary maps (e.g. in unit tests).
- The compile-time type check lives here (not in `scenarios/index.ts`) because the eslint boundary rule forbids `index.ts` from importing `src/modules.ts`.
- `shopModulesAreMounted` carries an `eslint-disable` for `no-unused-vars`; it is intentionally never read.
