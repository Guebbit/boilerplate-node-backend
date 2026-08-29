# src/modules/orders/tests/unit/totals.property.test.ts

## Purpose

Property-based tests (via `fast-check`) for `sumLineItems` and `orderTotal` in `totals.ts`. They lock in two guarantees: the functions are **total** (any input, including garbage types, yields a finite number without throwing) and **arithmetically exact in cents** (additivity, scaling, and order-independence hold with integer equality, not float tolerance). A regression to decimal accumulation or a lost `|| 0` guard would be caught.

## Key elements

- **`RUN`** — shared config: seed `20_260_809`, 300 runs, stop on first failure. One place to adjust the run for the whole file.
- **`nullish()`** — arbitrary yielding `null` or `undefined`; models the two spellings a failed product-populate can leave.
- **`lineItem()`** — well-formed arbitrary: integer `quantity` 0–1000, integer `product.price` 0–100 000 (cents).
- **`hostileLineItem()`** — arbitrary with garbage in every field (strings, booleans, floats, `null`, `undefined`, empty objects); drives the totality tests.
- **`describe('sumLineItems — totality')`** — asserts no `NaN`, no throw, and `count === items.length` for arbitrary hostile input.
- **`describe('sumLineItems — arithmetic invariants')`** — zero-cart identity, order-independence, non-negativity, exact additivity over concatenation (compared via `Math.round(· * 100)`), linear scaling of price with quantity, and the zero-quantity line contributing 0 to money but +1 to count.
- **`describe('orderTotal')`** — verifies `orderTotal` equals the line price when shipping is `undefined`/`null`/`0`, adds shipping exactly in cents, and never yields `NaN` even with hostile items and a non-numeric shipping cost.

## Relationships

- **`src/modules/orders/domain/totals.ts`** — the sole system under test. This file imports `sumLineItems`, `orderTotal`, and the `LineItem` type from there. Every assertion is a contract imposed on that module's public API.

## Notes

- All price comparisons multiply by 100 and round before asserting equality. This is intentional: it pins the implementation to integer-cent arithmetic and would fail a float-`+` implementation (e.g. `0.1 + 0.2 ≠ 0.3`).
- The seed in `RUN` makes every failing run reproducible; the header comment documents the convention that a counterexample should be frozen back into a plain `it()` with the seed as a comment.
- `hostileLineItem` uses `fc.oneof` with `requiredKeys: []`, so any subset of keys may be absent — it is intentionally broader than the TypeScript type and relies on the runtime guards in `sumLineItems`.
- `orderTotal` is tested with `shippingCost` as `undefined`, `null`, **and** `0` — the first two model pre-delivery orders and `pickup`, respectively.
