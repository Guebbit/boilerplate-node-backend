---
source: tests/unit/scenarios/check.test.ts
sha256: e874cd19172c65207435a02813522786c577e67560f963a62fb751a5de32ddf9
generated_at: 2026-09-23T20:29:05.325745+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/check.test.ts

## Purpose

Unit tests for the pure-list comparison in `scenarios/check.ts`. They prove that `findUnmetGuarantees` and `assertScenarioGuarantees` correctly detect mismatches between a scenario's declared guarantees and the subjects a built scenario offers — using hand-made subject maps so no scenario build (and therefore no database) is required.

## Key elements

- **`declaredForShop`** — Derived at module scope by flat-mapping `enabledModules` for every `scenario.shop` entry. Serves as the "truth" list of guarantee names without hardcoding them.
- **`satisfyingSubjects`** — A stand-in subject map (each guarantee name → a fixed fake id) that satisfies every declaration. Used as the "all clear" fixture.
- **`describe('findUnmetGuarantees')`** — Four cases: empty subjects (all guarantees unmet), exact match (no problems), an undeclared subject name left behind, and a scenario no module declares.
- **`describe('assertScenarioGuarantees')`** — Two cases: throws an error naming every problem; returns silently when the lists agree.

## Relationships

- **`scenarios/check.ts`** — The module under test. The file imports `findUnmetGuarantees` and `assertScenarioGuarantees` and exercises both directly.
- **`src/modules.ts`** — Source of `enabledModules`, from which `declaredForShop` is derived. This ties the test to real module declarations rather than a fixed literal list.

## Notes

- Guarantee names are **never restated** in the test body; they come from `enabledModules`. Adding a new `shop` guarantee to any module automatically extends the assertions here.
- The "ghost.leftBehind" case is the only one that exercises the *reverse* direction (a subject present but not declared), guarding against a scenario silently offering extra subjects.
- The file explicitly does **not** verify that a real, built scenario's `shop` satisfies its own declarations — that concern is delegated to `tests/integration/scenarios/shop.test.ts`.
- The assertion error message is asserted via a regex (`/[scenario-check] shop guarantees not met/`), so the exact wording after the prefix is free to change.
