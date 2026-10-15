---
source: tests/unit/scenarios/check.test.ts
sha256: f287c7fb7ec125abffedbc84d936af24299bfc42404bfe8f8e01de3e0e9c1851
generated_at: 2026-10-15T13:23:42.808046+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/check.test.ts

## Purpose

Unit tests for the scenario-guarantee checker (`scenarios/check.ts`). Verifies that `findUnmetGuarantees` and `assertScenarioGuarantees` correctly detect mismatches between the guarantee names a module declares for a scenario key and the subject map a built scenario actually offers. No database is involved; the tests feed hand-crafted subject maps to prove both directions of the comparison.

## Key elements

- **`declaredForShop`** — Derived constant: `enabledModules.flatMap(m => m.scenario?.shop ?? [])`. Collects every guarantee name the enabled modules declare under the `shop` key.
- **`satisfyingSubjects`** — A `Record<string, string>` built from `declaredForShop` where each guarantee name maps to an arbitrary id (`'65dc8a99604c307b702b5ccc'`). Serves as the "everything matches" fixture.
- **`describe('findUnmetGuarantees')`** — Four cases: empty subject map reports all declarations; exact match reports nothing; an extra undeclared subject (`ghost.leftBehind`) is flagged; an unknown scenario key (`'blank'`) with no declarations reports nothing.
- **`describe('assertScenarioGuarantees')`** — Two cases: throws an error prefixed `[scenario-check]` when problems exist; returns silently on a full match.

## Relationships

- **`scenarios/check.ts`** — The module under test. Exports `findUnmetGuarantees` (returns a string array of problems) and `assertScenarioGuarantees` (throws if problems exist, otherwise no-op). This file exercises both public APIs.
- **`src/modules.ts`** — Source of `enabledModules`. The test reads each module's `scenario?.shop` array to derive its fixtures, so the assertions stay in lockstep with whatever the codebase currently declares.

## Notes

- The checker compares **names only**; the id values in the subject map are irrelevant. The dummy id `65dc8a99604c307b702b5ccc` can be any string.
- `ghost.leftBehind` is deliberately a name no enabled module declares — it tests the reverse direction (subject present but unclaimed).
- If a new module adds a `shop` guarantee, `declaredForShop` picks it up automatically and the "empty map" test's expected length grows without editing the test.
- Real end-to-end validation (that the *actual* built scenario satisfies the *actual* declarations) lives in `tests/integration/scenarios/shop.test.ts`, which must construct the scenario to run.
