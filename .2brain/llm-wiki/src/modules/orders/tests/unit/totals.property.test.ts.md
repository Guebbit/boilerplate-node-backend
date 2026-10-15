---
source: src/modules/orders/tests/unit/totals.property.test.ts
sha256: 60ae96c452321b5fbe68ae8ea2f3ce1e7ec0901052ceb01efb7fb4eb5d6b9f66
generated_at: 2026-10-15T11:21:52.582071+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/totals.property.test.ts

## Purpose

Property-based tests (via `fast-check`) for `sumLineItems` and `orderTotal` in the orders domain. Verifies that the cart-total arithmetic is total (never NaN, never throws), additive, order-independent, and quantity-linear — all asserted exactly in cents to sidestep float tolerance.

## Key elements

- **`RUN`** — Single `{ seed, numRuns, endOnFailure }` config shared by every `fc.assert` call; `numRuns` comes from `PROPERTY_RUNS`.
- **`nullish()`** — Arbitrary producing `null` or `undefined`, covering both spellings a failed populate can leave.
- **`decimalPrice()`** — Cents-precise `double` prices (0 – 100 000.00).
- **`lineItem()`** — Well-formed `LineItem` record (integer quantity, cent-precise price).
- **`hostileLineItem()`** — Adversarial `LineItem` with arbitrary types in every field (`requiredKeys: []`), simulating a malformed aggregate.
- **`describe('sumLineItems — totality')`** — No NaN, no throws, `count === items.length` on hostile input.
- **`describe('sumLineItems — arithmetic invariants')`** — Zero on empty cart, order-independence, non-negativity, additivity over concatenation (cent-exact), price scales linearly with quantity, zero-quantity lines contribute 0 to money but +1 to count.
- **`describe('orderTotal')`** — Shipping-zero equivalence with `sumLineItems`, exact cent addition of shipping, no NaN on hostile input, per-currency minor-unit rounding (EUR/JPY/KWD spot check).

## Relationships

- **`src/modules/orders/domain/totals.ts`** — Imports `sumLineItems`, `orderTotal`, and the `LineItem` type under test.
- **`tests/support/knobs.ts`** — Imports `PROPERTY_RUNS` which sets the `numRuns` count for every property in this file.

## Notes

- Seed is hard-coded to `20_260_809`; a found counterexample is expected to be written back as a plain `it()` so the property suite stays green.
- `endOnFailure: true` means the first counterexample aborts the property run (no shrinking continuation).
- All property cases price in **EUR**; per-currency rounding is deliberately delegated to `money.property.test.ts` (only the final `orderTotal` spot-check exercises JPY/KWD).
- Arithmetic comparisons use `Math.round(x * 100)` rather than a tolerance, because the only residual imprecision is the single final division back to a `double`.
- `hostileLineItem` casts through `as fc.Arbitrary<LineItem>` because its record shape is a superset of the real type; this is intentional, not a bug.
