# src/modules/cart/tests/unit/factory.test.ts

## Purpose

Unit tests for the `makeCart` factory fixture. They verify that the factory correctly converts string IDs to `mongoose.Types.ObjectId` and that the resulting cart object matches the structural contract the rest of the codebase expects (ownership, item presence/absence semantics, ordering).

## Key elements

- **`USER` / `PRODUCT` constants** – Hardcoded 24-char hex strings representing a valid user and product ObjectId, used as input seeds across all cases.
- **`describe('makeCart', …)` block** – Five test cases covering:
  - `userId` is stored as a real `Types.ObjectId` (not a raw string).
  - When no `items` key is supplied, the returned object has **no** `items` property at all (schema default applies), rather than an empty array.
  - Each line's `productId` is converted to `Types.ObjectId` while `quantity` passes through unchanged.
  - An explicitly passed `items: []` is preserved as an empty array (distinct from the absent case).
  - Line order is preserved exactly as given.

## Relationships

- **`src/modules/cart/factory.ts`** – The sole subject under test. The file imports `makeCart` from that module and asserts on the shape and types of the object it returns. No other module is imported.

## Notes

- The "absent vs. empty items" distinction is load-bearing: `items: []` means "cart exists and was emptied," while a missing key defers to the Mongoose schema default. A regression that collapses the two would silently break any seed that wants to represent an existing-but-empty cart.
- Tests assert on `Types.ObjectId` instances specifically, not just string equality—this catches a factory that might return a string that *looks* like an ID but would fail in a Mongo `$ref`/join at query time.
- The file does **not** test the factory's handling of invalid or missing `userId`; that responsibility (if any) is expected to live elsewhere.
