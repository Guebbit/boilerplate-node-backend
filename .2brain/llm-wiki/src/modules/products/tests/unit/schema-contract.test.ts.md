---
source: src/modules/products/tests/unit/schema-contract.test.ts
source_sha256: 92e368f4094c432a17b37e304fec5127e842f3324eb5478bf4a0fc15b444c1b1
context_sha256: 4416ef54b2041ca56c6f6cab00e41d74b8ba1adce8e3bf7a832e404e68b5dee5
generated_at: 2026-11-22T07:19:48.717299+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/products/tests/unit/schema-contract.test.ts

## Purpose
Unit tests that pin down the product schema's contract: which fields are required, what each default means when a field is never set, which indexes exist, and what the serialization transform adds to the output. The defaults carry business meaning (for example, a new product is published unless told otherwise).

## Key elements
- `serialized()`: helper that runs `applyProductTransform({ _id: 'x' })` to get one bare serialized product.
- **`productSchema — what a product must carry`**:
  - Only `price` and `title` are required.
  - `active` defaults to `true`.
  - `requiresShipping` defaults to `true`. The comment says this matches `openapi.yaml`.
  - `categories` and `tags` default to `[]`.
  - `description`, `imageUrl` and `deletedAt` have no default (`undefined`). Soft deletion is the absence of `deletedAt`.
  - `timestamps` is enabled.
- **`productSchema — indexes`**:
  - Exactly three named indexes: `products_active_deletedAt` (`active+1, deletedAt+1`), `products_createdAt` (`createdAt-1`) and `products_sku` (`sku+1`).
  - `products_sku` must be `sparse` and `unique`, so products without a `sku` don't collide.
- **`applyProductTransform — the serialized product`**: the output contains a string `currency` and an `actions` object with `update`, `delete`, `restore` and `hardDelete` all `false`.

## Relationships
- `src/modules/products/model.ts`: provides `productSchema` and `applyProductTransform`, the two things under test.
- `tests/support/schema.ts`: imported through the `@tests/schema` alias. Its helpers `defaultOf`, `optionsOf`, `requiredPaths`, `indexSpecs` and `indexOptionSpecs` read the schema's defaults, options, required paths and indexes.
- `src/infrastructure/persistence/serialize.ts`: not imported here. The tests reach serialization only through `applyProductTransform`.

## Notes
- The index and default assertions compare against fixed strings and values, so any schema change to these must update the tests deliberately.
- Comments in the file explain the reasoning behind the defaults:
  - `categories` and `tags` feed the facet endpoint, so an absent array would need a separate code path in every consumer.
  - A description that is not set should be omitted from the output, never `''`.
  - The sparse `sku` index follows the same reasoning as `orders_transferReference` in `orders`.
