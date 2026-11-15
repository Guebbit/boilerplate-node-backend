---
source: src/modules/cart/model.ts
sha256: 853855e6076227bfaef9fd6301d3be1707e6e1766fcf484c1763f2946aa30623
generated_at: 2026-11-14T19:28:58.470479+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema, document interface, and model instance for the persistent cart collection (one document per user). It establishes the stored shape of cart lines, the shipping-method slot, TTL-based retention, and the serialization transform that the repository factory consumes. It deliberately does **not** produce the API response shape; that is a computed view built by `services/view`.

## Key elements

- **`CartItem`** — interface for a stored line: `productId` (ObjectId, no Mongoose `ref`) + `quantity` (1–999).
- **`CartDocument`** — document interface extending Mongoose `Document`. Adds `userId`, `items: CartItem[]`, optional `shippingMethodId` (plain string, not a DB reference), timestamps, and an explicitly typed `__v: number` (read by application code for optimistic-concurrency checks in `repository.clearLinesIfUnchanged`).
- **`CartModel`** — `Model<CartDocument>` type alias for the Mongoose model.
- **`CART_LINE_HARD_MAX`** — constant `999`; the schema-level ceiling that remains valid regardless of runtime config changes.
- **`cartItemSchema`** — subdocument schema with `_id: false` (lines are addressed by product, and the OpenAPI contract forbids extra properties).
- **`cartSchema`** — top-level schema. `userId` is `unique: true` (enforces one-cart-per-user at the DB level and enables `upsert` mutations). Indexes: `{ items.productId: 1 }` (unindexed scan guard for product-deletion) and `{ updatedAt: 1 }` TTL (`carts_updatedAt_ttl`, expiry = `NODE_CART_RETENTION_DAYS × DAY_SECONDS`).
- **`applyCartTransform`** — serialization function produced by `applySerialization(cartSchema)`; handles `_id → id` rename and `__v` stripping. Consumed by the repository factory for lean reads; no HTTP endpoint serializes this shape directly.
- **`cartModel`** — the Mongoose `model<CartDocument, CartModel>('Cart', cartSchema)` entrypoint.

## Relationships

- **`src/domain-primitives/time.ts`** — imports `DAY_SECONDS` to convert the configured retention days into seconds for the TTL index.
- **`src/infrastructure/persistence/serialize.ts`** — imports `applySerialization` to build `applyCartTransform`.
- **`src/modules/cart/config.ts`** — imports `cartConfig` to read `NODE_CART_RETENTION_DAYS` at module load time.
- **`src/modules/cart/repository.ts`** — the sole owner of all queries against `cartModel`; reads `__v` for conditional `findOneAndUpdate` (checkout race prevention).
- **`src/modules/cart/services/view.ts`** — reads cart lines and joins product data through the products service (`findManyByIds`); never uses Mongoose `populate`.
- **`src/modules/cart/services/merge.ts`** — reads/writes `items` on the document produced by this schema.
- **`src/modules/cart/index.ts`** — barrel re-exports the public API of this module.
- **Tests** (`schema-contract`, `retention`, `upsert-retry`, `cart-races`) — exercise the schema shape, TTL behavior, upsert semantics, and `__v`-based concurrency guard defined here.

## Notes

- **TTL index is immutable at runtime.** Changing `NODE_CART_RETENTION_DAYS` and restarting will crash boot (`autoIndex` requests a different `expireAfterSeconds`; Mongo refuses to alter an existing index). Use `npm run db:sync` to drop and rebuild.
- **`productId` is intentionally a bare ObjectId with no `ref`.** Cross-collection joins go through the products service's public API, never through Mongoose population. Adding a `ref` here would create a hidden coupling.
- **`shippingMethodId` is a string, not an ObjectId.** It names a static in-code list in `@modules/delivery`, not a collection. Do not add a `ref`.
- **`CART_LINE_HARD_MAX` (999) ≠ `cartLineMax()` from config.** The former is the schema ceiling (immutable once stored); the latter is a lower, runtime-configurable cap enforced at write time.
- **`_id: false` on cart items is a contract requirement.** The OpenAPI `CartItem` schema is `additionalProperties: false`; a generated subdocument `_id` would be a serialization violation.
