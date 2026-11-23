---
source: scenarios/check.ts
source_sha256: 551604abd74ea40e58fc98a9a95ff8ea3d6e67a01741435dce500a6c4570793c
context_sha256: d03891971b4b82156ec1f3ea545470167be0de60307c5f58b49f535d769e657b
generated_at: 2026-11-22T01:42:01.833525+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/check.ts

## Purpose
Keeps a scenario's *declared* guarantees (each enabled module's `AppModule.scenario` entries) and the *subjects* actually offered (the guarantee-name → row-id map returned by `buildScenario` and served by `GET /__test/scenario`) exactly equal. It checks both directions: a declared guarantee with no row is an unkeepable promise, and a subject no module declares is a leftover from a deleted module.

## Key elements
- `findUnmetGuarantees(scenarioName, subjects)` — collects declarations from every module in `enabledModules` for that scenario, then returns one message per problem: `"<module>: <guarantee> is declared but has no row"` or `"<guarantee> is a subject no enabled module declares"`. Returns `[]` when they agree. It takes `subjects` as a parameter rather than building the scenario, so it can be tested against hand-made lists.
- `assertScenarioGuarantees(scenarioName, subjects)` — wraps the above and throws a single `Error` (prefixed `[scenario-check]`) listing every mismatch. This is the form meant for tests.
- `ShopModulesAreMounted` / `shopModulesAreMounted` — compile-time check that every key of `shopModules` is a `ModuleName`. Otherwise the type resolves to `never` and the build fails, naming the offending key. The constant is never read; assigning `true` forces the compiler to evaluate the type.

## Relationships
- `scenarios/index.ts` — type-only import of `shopModules`. `buildScenario` there produces the `subjects` map this file validates.
- `src/modules.ts` — imports `enabledModules` (runtime) and `ModuleName` (type).
- `tests/integration/scenarios/shop.test.ts` — calls `assertScenarioGuarantees` right after building the scenario, and separately checks the rows themselves.
- `tests/unit/scenarios/check.test.ts` — tests the checker, presumably against hand-built subject lists. The file's docs say that is why `subjects` is a parameter.

## Notes
- The `shopModules` compile-time check lives here rather than in `scenarios/index.ts` because `scenarios/index.ts` is not allowed to import `src/modules.ts` under the project's lint boundaries.
- The `eslint-disable` on the unused constant is intentional.
- Without the compile-time check, a module seeding rows for an unmounted module would write a collection nothing serves, silently.
