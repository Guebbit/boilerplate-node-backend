# src/modules/wishlist/tests/unit/schema-contract.test.ts

## Purpose

Contract test for the Mongoose `wishlistSchema`. It pins down the schema-level decisions that are invisible in the OpenAPI document but drive runtime behavior: the unique index that makes "one wishlist per user" a database guarantee, the `_id: false` on line items, the default `[]` for `items`, and the compound index that makes product-deletion lookups efficient.

## Key elements

- **`describe('wishlistSchema')`** — seven `it` blocks, each asserting one schema property:
  - *Required paths* — only `userId`; `items` is optional so an upsert can create an empty wishlist.
  - *Unique index* — `indexOptionSpecs` must include `userId_1: unique=true`.
  - *Default value* — `defaultOf(schema, 'items')` equals `[]`.
  - *Types & refs* — `userId` is `ObjectId` → `User`; `items.productId` → `Product`.
  - *Line-item shape* — `_id` is `false`; the only path is `productId` (no quantity).
  - *Index specs* — exactly two indexes: `items.productId_1` and `userId_1`.
  - *Timestamps* — `timestamps` option is `true`.
- **Assertion helpers** — `requiredPaths`, `indexOptionSpecs`, `indexSpecs`, `defaultOf`, `typeOf`, `refOf`, `subSchema`, `optionsOf`, `pathNames` (all from `@tests/schema`) abstract Mongoose schema introspection so each test reads as a plain assertion.

## Relationships

- **`src/modules/wishlist/model.ts`** — provides `wishlistSchema`, the sole subject under test.
- **`tests/support/schema.ts`** — supplies every introspection helper the assertions use; no Mongoose API is called directly in this file.

## Notes

- The test file's comments encode *why* each constraint exists (e.g., `_id: false` keeps `$addToSet` idempotent; no `quantity` field separates wishlist from cart). Treat those comments as the design rationale.
- The `items.productId` index is deliberately left **unnamed** so Mongoose's derived name is the only name in the system.
- These tests verify the schema *declaration*, not runtime behavior. They will pass even if a service layer mutates documents incorrectly; pair with integration tests for that.
