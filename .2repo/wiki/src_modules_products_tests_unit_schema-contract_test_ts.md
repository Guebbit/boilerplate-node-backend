# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose

Locks down the product schema's public contract and the derived `available` field produced by `applyProductTransform`. It ensures that defaults, required-ness, min-bounds, indexes, and the availability computation behave exactly as the storefront and catalogue APIs assume, catching regressions before they surface as broken product listings.

## Key elements

- **`serialize(onHand, reserved)`** — small local helper that builds a minimal document (`{ _id, onHand, reserved }`) and returns the `.available` value from `applyProductTransform`. Used by every transform assertion.
- **`describe('productSchema — what a product must carry')`** — asserts required fields (`title`, `price` only), `min: 0` on both stock counters, the full set of defaults (`onHand: 100`, `reserved: 0`, `active: true`, empty string/array for text/list fields, env-overridable `imageUrl`), `deletedAt` left undefined, and `timestamps: true`.
- **`describe('productSchema — indexes')`** — pins the exact two compound indexes (`products_active_deletedAt`, `products_createdAt`) and their directions.
- **`describe('applyProductTransform — the derived availability')`** — verifies `available = max(onHand − reserved, 0)`, that missing counters are treated as `0` (not `NaN`), and that non-numeric values are treated as `0` rather than coerced.

## Relationships

- **`src/modules/products/model.ts`** — the module under test. The file imports `productSchema` (Joi/Mongoose schema definition) and `applyProductTransform` (the projection hook that adds the derived `available` field) and asserts their contract.
- **`tests/support/schema.ts`** — provides the introspection helpers used throughout: `requiredPaths`, `defaultOf`, `pathOptions`, `optionsOf`, and `indexSpecs`. These let the test read schema metadata declaratively instead of re-implementing Joi traversal.

## Notes

- The `imageUrl` default depends on `process.env.NODE_DEFAULT_IMAGE_PRODUCT`; tests will pass with whatever value that env var holds in the test environment, falling back to a placekitten URL.
- The transform tests for `undefined` counters exist to protect legacy documents written before schema defaults were added — they are a guard against `NaN → null → "out of stock"` in serialization, not a case the schema should normally produce.
- Index names and directions are asserted as exact strings; renaming or reordering an index in `model.ts` will break this test even if the query performance impact is neutral.
