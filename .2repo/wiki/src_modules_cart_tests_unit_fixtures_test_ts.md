# src/modules/cart/tests/unit/fixtures.test.ts

## Purpose

Unit tests for the `makeCart` fixture builder. They verify that the fixture performs its one critical job—converting string product/user IDs into real Mongoose `ObjectId` instances—so that seeded carts actually match catalogue lookups instead of silently appearing empty.

## Key elements

- **`USER`, `PRODUCT`** — module-level string constants (hex ObjectIds) used as test inputs.
- **`describe('makeCart', …)`** — five test cases covering:
  - `userId` is stored as a `Types.ObjectId` (not a raw string).
  - Omitting `items` entirely leaves the key absent from the returned object, letting the schema default apply.
  - Each line's `productId` is converted to an `ObjectId` while `quantity` passes through unchanged.
  - An explicitly empty `items: []` array is preserved as-is (distinct from the absent case).
  - Array ordering of items is preserved.

## Relationships

- **`src/modules/cart/fixtures.ts`** — provides the `makeCart` function under test; this file imports it via the `@modules/cart/fixtures` alias.
- **`mongoose`** — supplies `Types.ObjectId` used in assertions to verify instance types.

## Notes

- The file's docblock calls out the failure mode this test guards against: a string `productId` causes the service's catalogue join to match nothing, making a populated cart *behave* as if empty.
- The "omits items" test deliberately asserts absence (`Object.hasOwn`) rather than an empty array, so the fixture does not override the schema default.
- The "empty vs. absent" test encodes a domain distinction: `[]` means "cart was emptied"; missing key means "unspecified."
