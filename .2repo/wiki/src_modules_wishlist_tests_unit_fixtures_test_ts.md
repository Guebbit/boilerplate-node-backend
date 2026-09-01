# src/modules/wishlist/tests/unit/fixtures.test.ts

## Purpose

Unit tests for the `makeWishlist` fixture builder. They lock down the contract that the builder accepts bare product-id strings (not `{ productId }` objects), produces real `Types.ObjectId` values, and omits the `items` key entirely when no products are supplied so that the Mongoose schema default applies.

## Key elements

- **`USER`, `PANINO`, `PUFETTINO`** — module-level hex-string constants representing a user id and two product ids used across all cases.
- **`describe('makeWishlist')`** — single test suite containing five cases:
  - *stores the owner as a real ObjectId* — verifies `wishlist.userId` is a `Types.ObjectId` instance whose string form equals the input.
  - *omits items when none are given* — asserts the `items` key is absent (`Object.hasOwn` check) so the schema default can kick in.
  - *wraps each bare product id into a line* — confirms each entry in `items` is `{ productId: ObjectId }` preserving order.
  - *gives a line nothing but a product id* — asserts the only key on a line object is `productId` (explicitly no `quantity`).
  - *keeps an explicitly empty list distinct from an absent one* — `productIds: []` yields `items: []` rather than omitting the key.

## Relationships

- **`src/modules/wishlist/fixtures.ts`** — the module under test. This file imports `makeWishlist` and exercises its output shape; every assertion here defines the behavioral contract that the fixture builder must satisfy.

## Notes

- The "no quantity" test is intentional: a wishlist line is structurally different from a cart line. A fixture that sneakily added a `quantity` field would seed documents the schema strips and that the domain contract forbids.
- The distinction between `items` absent vs. `items: []` is load-bearing; seed files rely on the fixture omitting the key to let Mongoose defaults populate it, while an explicit empty array means "the user has zero wishlist items."
