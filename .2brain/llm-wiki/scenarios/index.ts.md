---
source: scenarios/index.ts
source_sha256: 9e52d7bdca59883d9ab54d94088e8970570b71ab3bf2746ca44dabf2bd1cced6
context_sha256: b233a6f75fee0ebf278ae6fe1f5243463c0ce33106ebee3be227a81a758c30ac
generated_at: 2026-11-22T01:43:48.978515+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/index.ts

## Purpose
The scenario registry: every named, whole-database state this repo can seed (`blank` plus each `scenarios/<name>.scenario.ts` file collected in `./scenarios.generated`). It lives in the removable `scenarios/` folder, which imports module repositories, models and factories directly, so a production image can omit the folder without anything under `src/` noticing.

## Key elements
- `Scenario` (internal interface): `seed()` writes the starting rows into an empty database. Optional `drive(baseUrl)` runs the app's real flows to build a history and returns extra subjects. `subjects` maps guarantee names to the row ids that were pinned.
- `SCENARIOS` (internal): `scenarioFixtures` plus `blank` (`seedBlank`, no subjects). It is checked with `satisfies Record<string, Scenario>`, so adding a scenario happens in one place.
- `ScenarioName`: type of the keys of `SCENARIOS`.
- `isScenarioName(name)`: type guard that narrows an unvalidated string (argv, request body) using `Object.hasOwn`. Callers need no `as ScenarioName` cast.
- `DEFAULT_SCENARIO`: `'shop'` if the registry carries it, otherwise `'blank'`. It is derived, so deleting the shop scenario needs no edit here.
- `buildScenario(name, app?)`: seeds the scenario, then, if it has `drive`, runs it against a loopback server. It resolves `{ ...subjects, ...extra }`.
- `shopModules`: re-exported from `./shop-modules`.

## Relationships
- `scenarios/apply.ts` and `scenarios/support/demo.ts` walk this registry. They import it rather than a hand-rolled ternary.
- `scenarios/blank.ts` supplies `seedBlank`.
- `scenarios/flows/loopback.ts` supplies `withLoopbackServer(app, drive)`, the throwaway listener the flows are driven against.
- `scenarios/support/no-human-challenge.ts` supplies `withoutHumanChallenge`, which wraps the drive step.
- `scenarios/shop-modules.ts` is the source of the re-exported `shopModules`.
- `scenarios/check.ts` holds a compile-time twin of the module registry. It rejects a `shopModules` entry whose name `enabledModules` lacks, a check this file can't do itself.
- `scenarios/seed.ts` provides the `SeedOutcome` type (imported as `@scenarios/seed`).
- `tests/integration/scenarios/shop.test.ts` and `tests/integration/access.test.ts` are related through the dependency graph. The file content doesn't show how they use it.

## Notes
- `buildScenario` assumes an empty database. The caller must empty it first.
- It throws synchronously, not as a rejected promise, if a scenario has `drive` but no `app` was passed. `blank` needs no app.
- Flows run with the human-challenge provider switched off, because the scripted flows can't solve one.
- Per `eslint.config.ts` boundaries, only `apply.ts`, `run-server.ts` and `check.ts` may reach `src/modules.ts`, so this file never imports it.
