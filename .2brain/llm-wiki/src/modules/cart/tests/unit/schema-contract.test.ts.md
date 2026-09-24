---
source: src/modules/cart/tests/unit/schema-contract.test.ts
sha256: 65ace207c10867ec54198273b654962ba3695184d6b7ed0d6f6951b4fcff2f8d
generated_at: 2026-09-23T18:35:03.297859+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose

Contract test that pins the exact shape, indexes, and options of `cartSchema`. It encodes the boundary between cart and wishlist (a cart line carries `quantity`; a wishlist line does not) and asserts that "one cart per user" is enforced by a unique index rather than application logic.

## Key elements

- **`RETENTION_SECONDS`** — module-level constant computed from `NODE_CART_RETENTION_DAYS` (default 365). Used to assert the TTL value without hard-coding a literal, so the test and the model stay in lockstep if the env var changes.
- **`describe('cartSchema')`** — top-level assertions:
  - Only `userId` is required; `items` defaults to `[]`; `userId` is a `ObjectId` ref to `User`.
  - Exact index set (`carts_updatedAt_ttl`, `items.productId_1`, `userId_1`) and their options (`expireAfterSeconds`, `unique=true`).
  - `timestamps: true` on the schema options.
- **`describe('cartSchema — a line')`** — sub-schema (`items`) assertions:
  - Required paths are `productId` + `quantity`; `_id` is disabled; `productId` refs `Product`.
  - `quantity` has `min: 1` (a zero-quantity line is a logical removal that didn't remove).
  - `pathNames` is exactly `['productId', 'quantity']`, cementing the cart-vs-wishlist distinction.

## Relationships

- **`src/modules/cart/model.ts`** — source of the `cartSchema` under test. Every assertion in this file reads its indexes, defaults, refs, and options.
- **`tests/support/schema.ts`** — provides the introspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `pathNames`, `pathOptions`, `subSchema`) that turn a Mongoose schema into comparable plain-value specs, avoiding direct Mongoose-internal access.

## Notes

- The TTL assertion compares against `RETENTION_SECONDS` (derived from the same env var the model reads), not a hard-coded number. A new TTL index appearing elsewhere would fail the exact-array `toEqual` in the retention test.
- The index set is asserted with `toEqual` (exact order and membership), so adding or reordering an index in `model.ts` breaks this test deliberately.
- The file does **not** test runtime behavior (mutations, upserts); it only freezes the schema's declarative contract.
