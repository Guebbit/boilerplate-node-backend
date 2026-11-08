---
source: tests/unit/scenarios/check.test.ts
sha256: f287c7fb7ec125abffedbc84d936af24299bfc42404bfe8f8e01de3e0e9c1851
generated_at: 2026-11-08T10:29:12.961622+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/check.test.ts

## Purpose

Unit tests for the `scenarios/check` module's two exported functions. It verifies that the pure list-comparison logic correctly reports mismatches between a scenario's declared guarantees and the subject map it actually offers, using hand-crafted fixtures (no database, no built scenario).

## Key elements

- **`declaredForShop`** — derived at module scope by flat-mapping every enabled module's `scenario.shop` array into a single list of guarantee names. Serves as the "expected" side of every comparison.
- **`satisfyingSubjects`** — a subject map built from `declaredForShop` where each key maps to the same stand-in id string (`'65dc8a99604c307b702b5ccc'`). Represents a perfectly conforming scenario.
- **`describe('findUnmetGuarantees')`** — four cases: empty subject map reports all guarantees; exact match reports none; an undeclared subject (`ghost.leftBehind`) is flagged; a scenario key no module declares for (`'blank'`) yields no errors.
- **`describe('assertScenarioGuarantees')`** — two cases: throws with a `[scenario-check]` prefix naming the scenario when problems exist; returns silently when the two lists agree.

## Relationships

- **`scenarios/check.ts`** — the module under test. Provides `findUnmetGuarantees` (returns an array of problem strings) and `assertScenarioGuarantees` (throws on mismatch, returns `undefined` on success).
- **`src/modules.ts`** — source of `enabledModules`, the live list of active app modules whose `scenario.shop` fields define the guarantee names the test expects. If a module is added or its `shop` array changes, the expected results shift automatically.

## Notes

- The stand-in id `'65dc8a99604c307b702b5ccc'` is arbitrary; the checker only compares *names*, not ids.
- The `ghost.leftBehind` case proves the checker is bidirectional: it flags subjects present in the map but absent from the declarations, not just missing ones.
- The `assertScenarioGuarantees` throw test deliberately uses only an undeclared name so it throws regardless of what the real `shop` declarations contain, making the assertion stable even as modules change.
- Real end-to-end verification (does the *actual* built shop satisfy the *actual* declarations) lives in `tests/integration/scenarios/shop.test.ts`, not here.
