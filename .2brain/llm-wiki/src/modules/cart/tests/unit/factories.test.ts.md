---
source: src/modules/cart/tests/unit/factories.test.ts
sha256: 330bc9715fb8ab6b3743cf727fb2074b4724444f19f7f43ef32482a977fcb741
generated_at: 2026-11-08T05:24:28.886533+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeCart` fixture builder. The core concern they guard: `makeCart` must convert the hex-string product/owner IDs it receives into real `Types.ObjectId` values, because a string `productId` silently breaks the catalogue join at read time (the cart "looks populated and behaves as if empty"). The remaining tests pin down the items-omitted-vs-empty distinction and line ordering.

## Key elements

- **`USER`, `PRODUCT`** — module-level hex-string constants used as seed values in every test case.
- **`describe('makeCart')`** — single describe block with five `it` assertions:
  - *owner stored as ObjectId* — `cart.userId` is an instance of `Types.ObjectId` and round-trips to the input string.
  - *items omitted when none given* — `Object.hasOwn(cart, 'items')` is `false`, leaving the schema default in charge of "empty".
  - *product id converted, quantity preserved* — `items[0].productId` is an `ObjectId`; `quantity` passes through unchanged.
  - *empty list distinct from absent* — `items: []` yields `cart.items` equal to `[]`, not an undefined key.
  - *line order preserved* — a two-line input produces `items` in the same sequence.

## Relationships

- **`src/modules/cart/factories.ts`** — the sole SUT. Imports `makeCart` from `@modules/cart/factories` and exercises its return shape. No other module is touched.
- **`mongoose`** — imported solely for `Types.ObjectId` in `expect(...).toBeInstanceOf(...)` checks.

## Notes

- The `items`-absent test deliberately uses `Object.hasOwn` rather than a truthiness check to distinguish "key not present" from "key present with falsy value". A future refactor that injects `items: []` by default would fail this test, which is the point.
- The empty-vs-absent distinction is semantically meaningful to the service layer (emptied cart vs. unspecified), so the fixture must not collapse the two; the test enforces that contract.
- Test data uses literal hex strings rather than `Types.ObjectId` constructors, mirroring what a seed file would actually pass in.
