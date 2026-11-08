---
source: scenarios/check.ts
sha256: 72d6b7a88938031d6b690e4215fe149ce9d9ac54e78805f9ae6b20f066ac75a0
generated_at: 2026-11-08T02:27:59.937648+00:00
model: ollama:qwen3.8:27b
---

# scenarios/check.ts

## Purpose

Guarantees that a scenario's **declared** guarantees (each `AppModule.scenario` entry) and the **subjects** it actually seeds (the id map from `buildScenario`) are two views of the same set. It enforces this in both directions—no dangling declaration, no orphan subject—and exposes the result as either a list of problem strings or a thrown error.

## Key elements

- **`ShopModulesAreMounted`** (type) — Compile-time assertion that every key in `shopModules` is a valid `ModuleName`. Evaluates to `true` or `never`; a `never` is the build error.
- **`shopModulesAreMounted`** (const) — Assigned `true` solely to force the compiler to resolve the type above. Never read; the eslint disable comment is intentional.
- **`findUnmetGuarantees(scenarioName, subjects)`** (export) — Collects all `scenario` guarantees declared by `enabledModules` for the given scenario name, diffs them against the provided `subjects` map, and returns a `string[]` of human-readable problems (empty array = perfect match).
- **`assertScenarioGuarantees(scenarioName, subjects)`** (export) — Calls `findUnmetGuarantees`; if any problems exist, throws a single `Error` listing every mismatch, prefixed `[scenario-check] <scenarioName>`.

## Relationships

- **`src/modules.ts`** — Imports `enabledModules` and the `ModuleName` type. The file walks `enabledModules` at runtime to gather declared guarantees and constrains `shopModules` keys at compile time.
- **`scenarios/index.ts`** — Imports the `shopModules` record (used only in the compile-time type check). Its `buildScenario` function produces the `subjects` map that callers pass into the two exported functions.
- **`tests/integration/scenarios/shop.test.ts`** — Calls `assertScenarioGuarantees` immediately after building the scenario; the thrown error fails the test.
- **`tests/unit/scenarios/check.test.ts`** — Unit-tests `findUnmetGuarantees` with hand-crafted `subjects` maps to verify it catches both directions of mismatch.

## Notes

- **ESLint boundary constraint:** Only this file, `scenarios/apply.ts`, and `run-server.ts` may import from `src/modules.ts`. That is why the compile-time `ShopModulesAreMounted` check lives here rather than in `scenarios/index.ts`.
- **`findUnmetGuarantees` does not build the scenario itself.** It receives the already-resolved `subjects` map as a parameter, keeping it a pure comparison and testable against arbitrary hand-made lists.
- The `shopModulesAreMounted` constant is intentionally unused; removing it (or the eslint-disable) would suppress the compile-time check.
