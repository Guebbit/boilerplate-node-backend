---
source: src/modules/orders/tests/unit/totals.property.test.ts
sha256: 75ea989b889b6b02341f74785ea45b4d266674a62b8fef2e4a4969ed2e24f5b7
generated_at: 2026-11-08T07:15:12.105583+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/unit/totals.property.test.ts

## Purpose

Property-based tests for `sumLineItems` and `orderTotal` in the orders domain. The file verifies totality (no NaN, no throws on arbitrary input), arithmetic invariants (additivity, scaling, order-independence, non-negativity), and the composition rule of `orderTotal` over `sumLineItems` plus shipping — all asserted exactly in minor units rather than to a float tolerance.

## Key elements

- **`RUN`** — Single source for the seed (`20_260_809`), run count (`PROPERTY_RUNS`), and `endOnFailure`. Changing the seed or run budget is a one-line edit.
- **`nullish()`** — Arbitrary yielding `null` or `undefined`; used to pin both spellings as distinct failure modes a failed populate can leave behind.
- **`decimalPrice()`** — Generates a cents-precise decimal string (`"0.00"` – `"100000.00"`) matching the `Product.price` contract.
- **`lineItem()`** — Well-formed `LineItem` record with integer quantity and decimal price.
- **`hostileLineItem()`** — Arbitrarily-shaped record (wrong types, missing fields, `null`/`undefined`) simulating a failed populate or malformed aggregate; cast to `LineItem`.
- **`describe('sumLineItems — totality')`** — Asserts no NaN, no throw, and correct `count` for *any* input.
- **`describe('sumLineItems — arithmetic invariants')`** — Empty-cart zero, order-independence, non-negativity, additivity over concatenation (compared via `toMinorUnits`), quantity scaling, and zero-quantity line behavior.
- **`describe('orderTotal')`** — Verifies it equals line total when shipping is absent/zero, adds shipping exactly in cents, never produces NaN, and rounds to the currency's own minor unit (EUR 2dp, JPY 0dp, KWD 3dp).

## Relationships

- **`src/modules/orders/domain/totals.ts`** — Supplies the functions under test (`sumLineItems`, `orderTotal`) and the `LineItem` type. All assertions target their public contract.
- **`src/domain-primitives/money.ts`** — `toMinorUnits` is used to convert decimal price strings to integer minor units so comparisons are exact rather than float-tolerant.
- **`tests/support/knobs.ts`** — Provides `PROPERTY_RUNS`, the centralised run-count constant shared across all property-test files.

## Notes

- All property tests price in **EUR**; per-currency rounding behaviour is explicitly delegated to `money.property.test.ts`.
- The fixed seed makes any counterexample deterministic and reproducible; `endOnFailure: true` stops the suite at the first violation.
- Additivity and scaling assertions compare **integer minor units** (via `toMinorUnits`) rather than floating-point sums, avoiding the `0.1 + 0.2 ≠ 0.3` class of false failures.
- `hostileLineItem` includes *both* `null` and `undefined` deliberately — dropping one to satisfy a lint rule would silently remove coverage of the other spelling.
- The last `orderTotal` test (multi-currency rounding) is an **example-based** assertion, not a property, because the number of currencies is finite and the expected outputs are hand-computed strings.
