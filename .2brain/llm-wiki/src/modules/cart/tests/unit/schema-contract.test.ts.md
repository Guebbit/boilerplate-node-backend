---
source: src/modules/cart/tests/unit/schema-contract.test.ts
sha256: 8d75247c1b2b466d9091fe4bedeccf3f6eadf1b977ae630437e2e1d2ea10bff0
generated_at: 2026-09-27T14:48:59.240765+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose

Asserts the full Mongoose schema contract for the cart collection: which fields are required, what indexes exist, what the `items` sub-schema looks like, and where the cart/wishlist boundary lies (the `quantity` field). It pins the schema so that a refactor of `model.ts` that silently drops an index, changes a default, or adds a field to a cart line fails immediately.

## Key elements

- **`RETENTION_SECONDS`** — module-level constant computed from `NODE_CART_RETENTION_DAYS` (default 365). Mirrors the model's own TTL default so the test and the policy move together.
- **`describe('cartSchema')`** — verifies top-level invariants:
  - `userId` is the sole required path; typed `ObjectId` ref to `User`.
  - `userId` carries a `unique` index (one cart per user enforced at the DB level).
  - `items` defaults to `[]`.
  - Full index set: TTL on `updatedAt`, `items.productId_1`, `userId_1`.
  - `timestamps: true`.
- **`describe('cartSchema — a line')`** — verifies the `items` sub-schema:
  - Required paths are exactly `['productId', 'quantity']`; `_id` disabled.
  - `quantity` has `min: 1` (no zero-quantity lines).
  - `productId` has **no** Mongoose `ref` (joins go through `productService`, not `populate`).
  - Field list is exactly `['productId', 'quantity']`, confirming the cart/wishlist shape boundary.

## Relationships

- **`src/modules/cart/model.ts`** — provides `cartSchema`, the sole subject under test. Every assertion in this file reads its Mongoose metadata (paths, indexes, defaults, options).
- **`tests/support/schema.ts`** — supplies the small assertion helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `typeOf`, `refOf`, `pathNames`, `pathOptions`, `subSchema`, `optionsOf`) that turn raw Mongoose internals into comparable strings/arrays.

## Notes

- The TTL test asserts `expireAfterSeconds` against the **computed** `RETENTION_SECONDS`, not a hard-coded number. Changing the env var moves both the model and this test in lockstep; a TTL index appearing on any other index also fails here.
- The absence of a `ref` on `items.productId` is a deliberate DDD choice (see `docs/theory/strategic-ddd.md` §5). A future contributor who "helpfully" adds `ref: 'Product'` will break this test — that is intentional.
- The `quantity.min === 1` assertion encodes the rule that removal is *deleting the line*, not setting quantity to zero.
