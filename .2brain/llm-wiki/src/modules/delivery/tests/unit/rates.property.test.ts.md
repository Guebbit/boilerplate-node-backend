---
source: src/modules/delivery/tests/unit/rates.property.test.ts
sha256: 9098ed0f62f07ed8c8cceeb919834b86db8992d68fba936f47781eb02a08a074
generated_at: 2026-09-23T18:38:23.874949+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/unit/rates.property.test.ts

## Purpose

Property-based tests (via `fast-check`) for the shipping-rate domain module. Where `rates.test.ts` pins three fixed points around the free-shipping threshold, this file checks invariants across _all_ valid item totals, using a fixed seed so any counterexample is reproducible and can be promoted back to a concrete example in the fixed-point suite.

## Key elements

- **`RUN`** – Single config object: seed `20_260_902`, `numRuns` sourced from `PROPERTY_RUNS`, `endOnFailure: true`.
- **`itemsTotal()`** – `fc.double` arbitrary: finite, non-negative, capped at 1 000 000. Used as the "any basket value" oracle.
- **`priceShipping — totality`** block – Two properties: result is never `NaN`/negative, and never exceeds the method's own flat `price`.
- **`priceShipping — the free-shipping threshold`** block – Three properties:
    - Free (0) at and above `standard.freeAbove`.
    - Flat rate at any amount _strictly_ below the threshold (guarded by `fc.pre(belowBy > 0)`).
    - `express` (no `freeAbove`) always charges its flat rate.
- **`methodFitsWeight — the declared range holds both ways`** – Property asserting the boolean result matches `!belowFloor && !aboveCeiling` for every method/weight pair.

## Relationships

- **`src/modules/delivery/domain/rates.ts`** – Source under test. Imports `priceShipping`, `methodFitsWeight`, `findShippingMethod`, and the `SHIPPING_METHODS` constant array.
- **`tests/support/knobs.ts`** – Provides `PROPERTY_RUNS` (number of iterations per property), imported as `@tests/knobs`.

## Notes

- The seed is hardcoded in `RUN`; change it only intentionally and note the old value in the commit.
- Threshold tests generate values as `integer / 100` (cents→dollars) to avoid floating-point edge cases that `fc.double` could produce near the threshold.
- The file doc comment states the workflow: any failing counterexample should be added as a concrete example in `rates.test.ts`.
- `endOnFailure: true` means the suite stops at the first counterexample rather than collecting many, which keeps the failure message focused.
