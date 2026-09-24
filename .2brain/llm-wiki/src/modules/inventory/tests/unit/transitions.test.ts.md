---
source: src/modules/inventory/tests/unit/transitions.test.ts
sha256: 27754edcb7474d1f32faf7946acc9b7918bbc6fd395ee3ea28eb2f31be0e7236
generated_at: 2026-09-23T18:47:44.394471+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/tests/unit/transitions.test.ts

## Purpose

Pure unit tests for the inventory transition table. Rather than restating the delta table, the suite asserts three structural invariants: (1) only `receive` or `adjust` changes total unit count, (2) `commit` moves `onHand` and `reserved` by equal amounts so availability is unaffected, and (3) `release`/`expire` are exact inverses of `reserve`. A second block pins the `availabilityOf` calculation and its edge cases (missing counters, negative clamp).

## Key elements

- **`describe('counterDeltaFor')`** — exhaustive reason coverage, exact signed-delta table (mirroring `openapi.yaml:162-171`), the "only receipts/adjustments create units" invariant, the commit-equality invariant, reserve-inverse checks, and the signed-adjust passthrough (negative quantity must not be `Math.abs`'d).
- **`describe('availabilityOf')`** — table-driven computation of `onHand − reserved`, the "absent counters → 0 (not unlimited)" rule, and the negative-value clamp at zero.
- **`EVERY_REASON`** — `Object.values(StockMovementReason)` used to iterate all contract-declared reasons, ensuring a new enum member added to the type forces a test run (exhaustive switch guard).

## Relationships

- **`src/modules/inventory/domain/index.ts`** — re-exports `counterDeltaFor` and `availabilityOf`, the two functions under test. This file imports them via `../../domain`.
- **`src/modules/inventory/domain/transitions.ts`** — likely implementation home for `counterDeltaFor` (the switch over `StockMovementReason`). Tests here would catch a wrong delta or a missing case.
- **`src/types/index.ts`** — provides the `StockMovementReason` enum imported as `@types`. The exhaustive-coverage test (`EVERY_REASON`) depends on this enum staying in sync with the transition table.

## Notes

- The `openapi.yaml:162-171` comment ties the exact-delta test to the API contract; if the spec changes, the `it.each` table here must follow.
- `adjust` is the only reason whose quantity is pre-signed; a `Math.abs` regression would silently flip shrinkage into a credit, which the dedicated "carries an adjustment's sign" test guards.
- Missing-counter behavior (`{}` → 0) is deliberately tested as a safety direction: a stock count that decides whether to charge a customer should default to "nothing sellable," never "unlimited."
