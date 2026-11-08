---
source: src/modules/wishlist/tests/unit/factories.test.ts
sha256: f6d607d7ab29bd1753ab8cce45f880ba6ce04594b703496893114ca9c333599e
generated_at: 2026-11-08T09:15:31.454350+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeWishlist` fixture builder, verifying that it produces correctly-shaped wishlist documents—particularly that bare product-id strings are mapped into `{ productId: ObjectId }` lines, that the owner is a real `ObjectId`, and that the "no items" vs "empty items" distinction is preserved.

## Key elements

- **`describe('makeWishlist')`** – single test suite covering five behaviors:
  - Owner stored as `Types.ObjectId` (not a raw string).
  - `items` key is **absent** (not `null`/`[]`) when no product IDs are passed, so the Mongoose schema default kicks in.
  - Each bare product-id string is wrapped into `{ productId: ObjectId }`; order is preserved.
  - A line's only key is `productId`—no quantity, no extra fields.
  - An explicitly empty `productIds: []` yields `items: []`, distinct from the absent-key case.
- **Constants `USER`, `DOG_FOOD`, `DOG_BED`** – hard-coded hex strings used as inputs; the factory is responsible for converting them to `ObjectId` instances.

## Relationships

- **`src/modules/wishlist/factories.ts`** – the sole SUT. The test imports `makeWishlist` from `@modules/wishlist/factories` and asserts on its return shape. No other module is exercised.
- **`mongoose`** – imported solely for `Types.ObjectId` to use in `toBeInstanceOf` assertions.

## Notes

- The "no quantity" test is load-bearing: it guards against accidentally copying the cart-line shape (which includes `quantity`) into wishlist fixtures. A fixture that added `quantity` would produce documents the schema strips, breaking the contract silently.
- The absent-vs-empty `items` distinction matters for seeding: omitting the key lets the Mongoose default (`[]` or whatever the schema declares) apply; passing `[]` bypasses the default. Tests treat these as different cases.
- Constants are plain hex strings on purpose—the test asserts the factory performs the string→`ObjectId` conversion, not the caller.
