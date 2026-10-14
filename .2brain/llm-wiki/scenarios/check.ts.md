---
source: scenarios/check.ts
sha256: 72d6b7a88938031d6b690e4215fe149ce9d9ac54e78805f9ae6b20f066ac75a0
generated_at: 2026-10-14T06:56:03.055173+00:00
model: ollama:qwen3.8:27b
---

# scenarios/check.ts

## Purpose

Validates that a scenario's declared guarantees (each module's `AppModule.scenario` entries) exactly match the subjects the scenario actually builds. Catches both orphaned guarantees (declared but no row seeded) and orphaned subjects (row seeded but no module declares it). It is the only guard for this invariant.

## Key elements

- **`ShopModulesAreMounted`** (type) — compile-time assertion that every key in `shopModules` is a valid `ModuleName`; a `never` result produces a build error naming the offending key.
- **`shopModulesAreMounted`** (const) — never-read assignment of `true` to the type above, forcing the compiler to evaluate it.
- **`findUnmetGuarantees(scenarioName, subjects)`** (exported function) — pure comparison of two lists; returns a string array (one line per problem) of guarantees declared by enabled modules but absent from `subjects`, plus subjects present in `subjects` that no enabled module declares. Takes `subjects` as a parameter so it can be tested against hand-made data.
- **`assertScenarioGuarantees(scenarioName, subjects)`** (exported function) — wraps `findUnmetGuarantees`; throws a single `Error` listing all mismatches, or does nothing if clean.

## Relationships

- **`src/modules.ts`** — imports `enabledModules` (iterates their `.scenario` maps at runtime) and the `ModuleName` type (used in the compile-time check).
- **`scenarios/index.ts`** — imports the `shopModules` type for the compile-time check; at runtime, `buildScenario` (from that file) produces the `subjects` record passed into both exported functions.
- **`tests/integration/scenarios/shop.test.ts`** — calls `assertScenarioGuarantees` immediately after building the shop scenario; failure aborts the test.
- **`tests/unit/scenarios/check.test.ts`** — unit-tests `findUnmetGuarantees` against hand-crafted `subjects` objects to prove it detects both mismatch directions.

## Notes

- The compile-time check lives in this file (not in `scenarios/index.ts`) because the ESLint boundary config only permits `check.ts`, `apply.ts`, and `run-server.ts` to import from `src/modules.ts`.
- `findUnmetGuarantees` deliberately does **not** build or seed a scenario itself — it is a pure list-comparison so tests can feed it arbitrary `subjects` without a database.
- The check is bidirectional: a guarantee with no row means the backend cannot keep a promise; a subject with no declaring module means a name was left behind after its owning module was removed.
