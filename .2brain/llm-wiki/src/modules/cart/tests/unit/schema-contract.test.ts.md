---
source: src/modules/cart/tests/unit/schema-contract.test.ts
sha256: f55e20295cba1590c3d80c47aa956609d0f5ae9b224e4d1d890ab127371a3862
generated_at: 2026-10-15T10:26:04.532974+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/tests/unit/schema-contract.test.ts

## Purpose

Unit test that pins the Mongoose schema contract for the `cart` collection: required fields, indexes, defaults, TTL expiry, and the shape of each line item. It exists so that any accidental schema drift (a missing index, a wrong default, an extra field) fails at test time rather than surfacing as a production query or data bug.

## Key elements

- **`RETENTION_SECONDS`** — constant derived from `currentEnvironment().NODE_CART_RETENTION_DAYS` (default 365 days); feeds the TTL assertion so the test tracks the env var.
- **`describe('cartSchema', …)`** — top-level assertions:
  - Only `userId` is required.
  - `userId` carries a `unique: true` index (enforces one-cart-per-user at the DB level).
  - `items` defaults to `[]` (present but empty).
  - `userId` is an `ObjectId` with `ref: 'User'`.
  - Exact index set: TTL on `updatedAt`, `items.productId`, `userId`.
  - TTL `expireAfterSeconds` equals `RETENTION_SECONDS` and appears *only* on the `updatedAt` index.
  - Schema-level `timestamps: true`.
- **`describe('cartSchema — a line', …)`** — `items` sub-schema assertions:
  - Required: `productId`, `quantity`; no auto `_id`.
  - `productId` has **no** Mongoose `ref` (joins go through `productService`, not `populate`).
  - `quantity` has `min: 1`.
  - Exact path list is `['productId', 'quantity']` — the field that distinguishes a cart line from a wishlist line.

## Relationships

- **`src/modules/cart/model.ts`** — source of `cartSchema`, the object under test.
- **`tests/support/schema.ts`** — provides all inspection helpers (`requiredPaths`, `indexSpecs`, `indexOptionSpecs`, `defaultOf`, `typeOf`, `refOf`, `optionsOf`, `pathNames`, `pathOptions`, `subSchema`) that let the tests read the schema declaratively without instantiating documents.
- **`src/infrastructure/config/store.ts`** — source of `currentEnvironment()`, used to read `NODE_CART_RETENTION_DAYS` so the TTL assertion stays in lockstep with deployment config.

## Notes

- The TTL test asserts the full `indexOptionSpecs` array, not just the TTL entry, so a TTL accidentally placed on a *different* index will also fail.
- The absence of a `ref` on `items.productId` is intentional and cross-referenced to `docs/theory/strategic-ddd.md §5`; do not "fix" it by adding a `ref`.
- `quantity` min of 1 encodes the policy that a zero-quantity line is equivalent to a removed line; the schema enforces this rather than leaving it to application logic.
