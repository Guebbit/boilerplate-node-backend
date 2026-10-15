---
source: src/modules/cart/model.ts
sha256: 9db937d96443e83126c497fa49737100649537a55f56b73dec29e51eac4d1591
generated_at: 2026-10-15T10:23:45.465549+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema, document interface, and model for the cart collection. One document per user (enforced by a unique index on `userId`) stores the cart's items and an optional shipping-method id. Field names are chosen to match the OpenAPI `CartItem` shape so stored and wire representations stay identical.

## Key elements

- **`CartItem`** (interface) — a single cart line: `productId` (ObjectId) + `quantity` (number).
- **`CartDocument`** (interface) — the full document: `userId`, `items: CartItem[]`, optional `shippingMethodId`, timestamps, and an explicit `__v: number` (read by `clearLinesIfUnchanged` in `./repository` for optimistic concurrency).
- **`CART_LINE_HARD_MAX = 999`** — schema-level ceiling on per-line quantity. The shop's lower, configurable ceiling lives in `./config` (`cartLineMax`).
- **`cartItemSchema`** — subdocument schema with `_id: false`; enforces `quantity` between 1 and `CART_LINE_HARD_MAX`.
- **`cartSchema`** — top-level schema; `userId` is `unique: true`, `timestamps: true`. Two indexes: a compound index on `items.productId` (for product-deletion lookups) and a TTL index on `updatedAt` (`carts_updatedAt_ttl`).
- **`applyCartTransform`** — wraps `applySerialization(cartSchema)` (shared `_id`→`id` rename + `__v` strip) for lean-read normalization in the repository factory.
- **`cartModel`** — the registered Mongoose model (`'Cart'`).

## Relationships

- **`@infrastructure/persistence/serialize`** — provides `applySerialization`, used to build `applyCartTransform`.
- **`./config`** — supplies `cartConfig().NODE_CART_RETENTION_DAYS` for the TTL index's `expireAfterSeconds`.
- **`./repository`** — consumes `cartModel`, `CartDocument`, `CartModel`, and `applyCartTransform`; performs all queries and the `__v`-based conditional clear.
- **`./factories`** — instantiates the repository using the model/transform exports.
- **`./services/view`** — reads cart lines via the repository and builds `CartResponse`; joins product data through `@modules/products`, never via Mongoose `populate`.
- **`./services/merge`** — writes/updates cart lines through the repository.
- **`./index`** — re-exports the public surface of this module.
- **Tests** — schema-contract tests assert field names/defaults against OpenAPI; retention tests verify TTL config; upsert-retry and cart-races tests exercise the unique-`userId` + `__v` concurrency guarantees.

## Notes

- **TTL index is immutable after creation.** Changing `NODE_CART_RETENTION_DAYS` and restarting will *fail boot* (`autoIndex` requests the new window; Mongo refuses to alter an existing index). Run `npm run db:sync` to drop and rebuild.
- **`__v` is application-read.** Unlike most documents where the version key is driver-internal, here checkout compares it to prevent two parallel checkouts from both succeeding.
- **No `ref` / `populate` on `productId`.** Despite `userId` having `ref: 'User'`, cart never populates; cross-module reads go through the owning module's service.
- **`_id: false` on cart lines** is deliberate: `CartItem` is `additionalProperties: false`, so a generated subdocument id would be a contract violation if ever serialized.
- **TTL is on `updatedAt`, not `createdAt`.** Any modification (quantity bump, line add) resets the abandonment clock.
