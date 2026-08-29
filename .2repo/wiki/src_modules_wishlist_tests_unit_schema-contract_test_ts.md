# src/modules/wishlist/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins the Mongoose `wishlistSchema` to its invariants: one wishlist per user (unique index), items addressed solely by `productId` (no subdocument `_id`, no quantity field), a default empty `items` array, correct ObjectId references, and the compound index that product-deletion lookups depend on. It exists so that any future change to the schema that silently breaks those invariants fails here rather than surfacing at runtime.

## Key elements

- **`describe('wishlistSchema')`** — single suite; each `it` asserts one invariant via helpers from the test-support module.
- **`requiredPaths` / `pathNames`** — assert the top-level required field is only `userId`, and that an item subdocument contains *only* `productId` (no hidden extra fields).
- **`indexOptionSpecs` / `indexSpecs`** — verify the `userId` unique index and the `items.productId` index exist with the expected Mongoose-derived names.
- **`defaultOf`** — asserts `items` defaults to `[]`, so readers never see `undefined`.
- **`typeOf` / `refOf`** — confirm `userId` → `User`, `productId` → `Product`, both as `ObjectId`.
- **`optionsOf`** — asserts `_id: false` on the item sub-schema and `timestamps: true` on the top-level schema.

## Relationships

- **`src/modules/wishlist/model.ts`** — source of `wishlistSchema`; this file imports and inspects it. Any change to the model's schema definition is validated here.
- **`tests/support/schema.ts`** — provides every inspection helper (`requiredPaths`, `indexSpecs`, `subSchema`, `refOf`, etc.). All assertions in this file delegate to those helpers; no raw Mongoose introspection is duplicated here.

## Notes

- The file's leading doc comment is a **design rationale**, not a test description. It explains *why* `unique: true` on `userId` enables upsert-only mutations, and *why* `_id: false` on items is required for OpenAPI contract compliance (`additionalProperties: false` in `WishlistItem`). Read it before modifying the schema.
- Index names (`userId_1`, `items.productId_1`) are Mongoose's auto-derived names; the test matches them exactly. If you rename an index, update these strings.
- The "no quantity" assertion is a **domain guard**: the test deliberately fails if someone adds a `quantity` field, enforcing the boundary between wishlist ("do I want this?") and cart ("how many?").
- Tests are pure shape checks—no MongoDB connection, no mocking needed.
