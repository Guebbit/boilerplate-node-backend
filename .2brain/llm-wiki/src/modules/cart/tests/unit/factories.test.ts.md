---
source: src/modules/cart/tests/unit/factories.test.ts
sha256: 330bc9715fb8ab6b3743cf727fb2074b4724444f19f7f43ef32482a977fcb741
generated_at: 2026-09-23T18:34:32.823690+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/factories.test.ts

## Purpose

Unit tests for the `makeCart` factory builder. They verify the factory's one critical transformation—converting string product/user IDs into real `Types.ObjectId` instances—and that it handles the absence vs. explicit empty-cart distinction correctly, ensuring seeded carts actually join against the catalogue rather than silently matching nothing.

## Key elements

- **`USER` / `PRODUCT`** – module-level hex-string constants used as test input IDs.
- **`describe('makeCart', …)`** – the single test suite containing five `it` blocks:
    - _stores the owner as a real ObjectId_ – asserts `cart.userId` is an `Types.ObjectId` whose `String()` round-trips back to the input.
    - _omits items entirely when none are given_ – asserts the `items` key is **absent** from the object so the schema default governs an empty cart.
    - _converts each line's product id and keeps its quantity_ – asserts `productId` is an `ObjectId` and `quantity` is unchanged.
    - _keeps an explicitly empty item list distinct from an absent one_ – asserts `items: []` is preserved (cart "was emptied") versus the key being missing (cart "unspecified").
    - _preserves the order of the lines it is given_ – asserts the array order of items is not shuffled.

## Relationships

- **`src/modules/cart/factories.ts`** – sole subject under test; this file imports `makeCart` from there and exercises every public contract of that function.
- **`mongoose` (`Types.ObjectId`)** – used in assertions to confirm the factory produces genuine ObjectId instances rather than plain strings.

## Notes

- The file deliberately does **not** test the schema/Mongoose model itself; it isolates the factory's transformation logic.
- The "absent vs. empty" distinction is load-bearing: a fixture that collapses `undefined` and `[]` cannot seed a cart that _exists but holds nothing_, which would break integration tests that read the cart back.
- All ID constants are 24-char hex strings; if you add new test cases, keep using the same format so the ObjectId conversion path is actually exercised.
