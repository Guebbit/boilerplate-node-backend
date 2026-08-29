# src/modules/wishlist/tests/unit/factory.test.ts

## Purpose

Unit tests for the `makeWishlist` fixture builder. Verifies that the factory correctly shapes raw string ids into a Mongoose-compatible wishlist document — specifically the `userId` → `ObjectId` cast, the absent-vs-empty distinction for `items`, and the bare-`productId`-only line shape that distinguishes a wishlist line from a cart line.

## Key elements

- **`USER`, `PANINO`, `PUFETTINO`** — hex-string constants used as inputs; the factory is expected to cast them to `Types.ObjectId`.
- **`describe('makeWishlist')`** — five focused assertions:
  - Owner id is a real `ObjectId` (not a plain string).
  - Omitting `productIds` leaves `items` absent from the object (so the Mongoose schema default kicks in), rather than setting it to `[]`.
  - Each bare id in `productIds` is wrapped into `{ productId: ObjectId }`.
  - A line contains *only* the `productId` key — no `quantity` or other fields.
  - Passing `productIds: []` yields `items: []` (distinct from the absent case above).

## Relationships

- **`src/modules/wishlist/factory.ts`** — the system under test. `makeWishlist` is imported from there and every assertion checks its output shape. The test file does not mock or stub this dependency; it exercises the real factory.

## Notes

- The tests intentionally assert **structural absence** (`Object.hasOwn … 'items'`) vs **explicit empty** (`items === []`). Seed files that blur this distinction will break schema-default expectations.
- The "no quantity" test is a contract guard: a wishlist line is *only* a product id. If a fixture ever adds `quantity`, the schema strips it and the API contract is violated — the test fails early.
- Inputs are bare hex strings, not `{ productId }` objects. The mapping lives inside `makeWishlist`, keeping seed/fixture files from repeating it.
