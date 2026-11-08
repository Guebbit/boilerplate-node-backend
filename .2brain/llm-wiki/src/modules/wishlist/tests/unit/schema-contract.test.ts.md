---
source: src/modules/wishlist/tests/unit/schema-contract.test.ts
sha256: 87dc31a9c242998317d3ab607c59c613e2ad1b46858fa33b105518e7e666063b
generated_at: 2026-11-08T09:15:49.995539+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins the Mongoose schema contract for the wishlist: which fields are required, how uniqueness is enforced at the database level, what defaults exist, and which indexes are declared. It exists so that any change to `wishlistSchema` in the model must be consciously reflected in these expectations, making the "one wishlist per user / no per-line id / no quantity" invariants a hard, reviewed fact rather than an implicit assumption.

## Key elements

- **`describe('wishlistSchema', …)`** — single top-level suite; no nested suites. Every assertion is a flat `it` block.
- **Required-path check** — asserts `requiredPaths(wishlistSchema)` equals `['userId']`; `items` is intentionally optional so the creating upsert can omit it.
- **Unique-index check** — asserts `indexOptionSpecs` contains `'userId_1: unique=true'`, guaranteeing one document per user at the DB level.
- **Default check** — asserts `defaultOf(…, 'items')` is `[]` so readers never see `undefined`.
- **Reference / type checks** — `typeOf` + `refOf` confirm `userId → ObjectId/User` and `items.productId → ObjectId/Product`.
- **Item-subschema checks** — `optionsOf(item)._id` is `false`; `requiredPaths` and `pathNames` both equal `['productId']` only (no `_id`, no `quantity`).
- **Index-spec check** — asserts the exact index list: `items.productId_1` (for product-deletion lookups) and `userId_1`. The `items.productId` index is deliberately left unnamed.
- **Timestamps check** — `optionsOf(…).timestamps` is `true`.

## Relationships

- **`src/modules/wishlist/model.ts`** — the sole SUT. The test imports `wishlistSchema` and asserts every structural property of it. Changing the schema without updating these expectations breaks the build.
- **`tests/support/schema.ts`** — provides the assertion vocabulary (`requiredPaths`, `indexOptionSpecs`, `indexSpecs`, `optionsOf`, `defaultOf`, `pathNames`, `refOf`, `subSchema`, `typeOf`). This file never calls Mongoose directly; all introspection goes through those helpers.

## Notes

- The test file's module docblock encodes *why* two choices are load-bearing: `unique: true` on `userId` makes every write an unguarded `findOneAndUpdate(…, { upsert: true })`, and `_id: false` on the item sub-schema mirrors `WishlistItem`'s `additionalProperties: false` in `openapi.yaml`. Removing either silently breaks a cross-cutting assumption.
- The `items.productId` index is intentionally unnamed; the comment notes that nothing else creates an index on that path, so Mongoose's auto-derived name is the only name and cannot conflict.
- "No quantity" is a domain boundary: the wishlist answers *whether* a product is wanted, not *how many*; quantity lives in the cart. The test enforces this by asserting `pathNames(item)` is exactly `['productId']`.
