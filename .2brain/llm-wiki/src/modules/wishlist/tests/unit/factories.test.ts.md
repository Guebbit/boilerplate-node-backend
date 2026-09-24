---
source: src/modules/wishlist/tests/unit/factories.test.ts
sha256: f6d607d7ab29bd1753ab8cce45f880ba6ce04594b703496893114ca9c333599e
generated_at: 2026-09-23T19:49:18.763979+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeWishlist` factory. Verifies that the factory correctly converts string IDs into Mongoose `ObjectId` instances, that wishlist line items contain **only** a `productId` (no quantity), and that an absent `items` field is kept distinct from an explicitly empty one so schema defaults apply.

## Key elements

- **`USER`, `DOG_FOOD`, `DOG_BED`** – hardcoded hex-string fixture IDs (owner + two products) used across all assertions.
- **`describe('makeWishlist')`** – five test cases:
  - *stores the owner as a real ObjectId* – asserts `wishlist.userId` is a `Types.ObjectId` and round-trips to the original hex string.
  - *omits items when none are given* – asserts `'items'` key is absent so the Mongoose schema default kicks in.
  - *wraps each bare product id into a line* – asserts each `productIds` entry becomes `{ productId: ObjectId }`.
  - *gives a line nothing but a product id* – asserts the only key on a line is `productId` (no quantity or other fields).
  - *keeps an explicitly empty list distinct from an absent one* – asserts `productIds: []` yields `items: []`, not a missing key.

## Relationships

- **`src/modules/wishlist/factories.ts`** – the sole subject under test. The file imports `makeWishlist` and exercises its public contract; no other module is touched.
- **`mongoose` (`Types`)** – imported solely to reference `Types.ObjectId` in `toBeInstanceOf` assertions.

## Notes

- The "no quantity" test is intentional and load-bearing: it codifies the domain rule that a wishlist line is *just* a product id, in contrast to a cart line which carries a quantity. A fixture that silently added a quantity would seed documents the schema strips and the API contract forbids.
- The absent-vs-empty `items` distinction is a real schema-level behavior (default array vs. no key); both states must be preserved because downstream code may check `hasOwnProperty` before iterating.
