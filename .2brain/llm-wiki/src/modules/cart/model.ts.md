---
source: src/modules/cart/model.ts
sha256: 7b70c56b6acdee3bf7faa079d3bf225263e1a19b24973e9ad478c6b9d1aa5dfd
generated_at: 2026-11-08T05:14:26.984466+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema, document interfaces, and model for the per-user cart collection. It encodes the storage contract (field names, constraints, indexes, TTL) so that cart data matches the `openapi.yaml` `CartItem` wire shape and stays valid across config changes. It is the single source of truth for what a cart document looks like at rest.

## Key elements

- **`CartItem`** — interface for one line: `productId` (ObjectId, no Mongoose ref) and `quantity` (1–999).
- **`CartDocument`** — extends Mongoose `Document`; adds `userId` (unique), `items: CartItem[]`, optional `shippingMethodId` (string, not a DB ref), `createdAt`/`updatedAt`, and `__v` (declared explicitly because application code reads it for optimistic locking in checkout).
- **`CartModel`** — `Model<CartDocument>` type alias.
- **`CART_LINE_HARD_MAX`** (999) — schema-level quantity ceiling; immutable regardless of shop-configured lower limits.
- **`cartItemSchema`** — subdocument schema with `_id: false` (avoids a contract violation from `additionalProperties: false` in the API schema).
- **`cartSchema`** — top-level schema: unique `userId`, `items` (default `[]`), `shippingMethodId`, `timestamps: true`. Two indexes: one on `items.productId` (for product-deletion sweeps) and a TTL index on `updatedAt` (`carts_updatedAt_ttl`).
- **`applyCartTransform`** — thin wrapper around `applySerialization(cartSchema)`; converts `_id`→`id` and strips `__v` for lean-read normalization. No endpoint serializes this shape directly.
- **`cartModel`** — the registered Mongoose model (`'Cart'`), the entrypoint for all repository operations.

## Relationships

- **`@domain-primitives/time`** — imports `DAY_SECONDS` to convert the retention-days config into the TTL index's `expireAfterSeconds`.
- **`@infrastructure/persistence/serialize`** — imports `applySerialization` to build `applyCartTransform`.
- **`./config`** — reads `cartConfig().NODE_CART_RETENTION_DAYS` at import time for the TTL value.
- **`./repository`** — consumes `cartModel` for all queries (`findOneAndUpdate` upserts, `clearLinesIfUnchanged` which compares `__v`).
- **`./services/view`** — reads cart lines via the repository and joins product data through the products module's public service, never via Mongoose `populate`.
- **`./services/merge`** — operates on `CartDocument.items` when merging carts.
- **`./index`** — re-exports the model and types for external import.
- **Tests** (`schema-contract`, `retention`, `upsert-retry`, `cart-races`) — assert schema shape, TTL behavior, upsert concurrency, and the `__v`-based optimistic lock.

## Notes

- **TTL is read once at import.** Changing `NODE_CART_RETENTION_DAYS` and restarting will **fail boot** (`autoIndex` requests a new index spec; Mongo refuses to alter an existing one). Apply changes via `npm run db:sync`, which drops and rebuilds the index.
- **`shippingMethodId` is a plain string**, not a Mongoose `ref`. It names an entry in `@modules/delivery`'s static in-code `SHIPPING_METHODS` list; there is no collection to reference.
- **`userId` has `ref: 'User'` in the schema** but no code in this module ever `populate()`s it. The ref is documentary only; lookups go through the user module.
- **`__v` is deliberately typed** in `CartDocument` (Mongoose types it as `any`) so the `clearLinesIfUnchanged` version comparison in `./repository` is type-safe and documented in one place.
- **`_id: false` on `cartItemSchema`** is load-bearing: the API contract forbids extra properties, so a generated subdocument id would be a serialization bug. Revisit only if product variants require per-line addressing.
