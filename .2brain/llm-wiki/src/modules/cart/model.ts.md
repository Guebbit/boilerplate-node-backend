---
source: src/modules/cart/model.ts
sha256: 6764aab43a4947767874d1702590e342c4c3c26a8ec5a613cb9a4e4f00befd89
generated_at: 2026-09-27T14:44:40.030826+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema, document interfaces, and model for the cart collection. One document per user (enforced by a unique index on `userId`), storing cart lines and an optional shipping-method id. It exists to be the sole durable copy of a user's cart — deliberately Mongo rather than Redis, which is cache-only and fails open.

## Key elements

- **`CartItem`** (interface) — A single line: `productId` (ObjectId) + `quantity` (number). No Mongoose `ref`/`populate`; product lookups go through the products module's public service.
- **`CartDocument`** (interface) — Full document shape: `userId`, `items: CartItem[]`, optional `shippingMethodId`, timestamps, and an explicitly typed `__v: number` (read by `repository.clearLinesIfUnchanged` for conditional checkout clearing).
- **`CartModel`** (type) — `Model<CartDocument>` alias; queries live in `repository.ts`, rules in `services/`.
- **`CART_LINE_MAX`** (const, 999) — Hard ceiling on a line's stored quantity. The per-request bound in the OpenAPI spec is separate; this is the guard that catches cumulative `add`-mode writes.
- **`cartItemSchema`** — Subdocument schema with `_id: false` (lines are addressed by product, and the OpenAPI contract forbids extra properties).
- **`cartSchema`** — Top-level schema: `unique: true` on `userId` enables single `findOneAndUpdate` upserts; `timestamps: true`; a compound index on `items.productId` (reverse lookup for product deletion); a TTL index on `updatedAt` driven by `NODE_CART_RETENTION_DAYS` (default 365).
- **`applyCartTransform`** — Serialization normalizer (strips `_id`→`id`, removes `__v`) produced by `applySerialization(cartSchema)`. Required by the repository factory for lean reads even though no endpoint returns the raw document shape.
- **`cartModel`** — The registered Mongoose model (`'Cart'`), the entry point other modules use.

## Relationships

- **`@infrastructure/persistence/serialize`** — Imports `applySerialization` to build `applyCartTransform`.
- **`@infrastructure/runtime/environment`** — Imports `environmentNumber` to read `NODE_CART_RETENTION_DAYS` at module load (TTL index value is fixed at startup).
- **`src/modules/cart/repository.ts`** — Owns all queries against this model; reads `__v` for optimistic `clearLinesIfUnchanged`.
- **`src/modules/cart/services/view.ts`** — Builds the wire `CartResponse` by hand from lines + product prices; never serializes the document directly.
- **`src/modules/cart/services/reorder.ts`** — Issues `add`-mode writes via the repository that can push a line's quantity toward `CART_LINE_MAX` across multiple requests.
- **`src/modules/cart/factories.ts`** — Consumes `cartModel` / `applyCartTransform` to wire up the repository factory.
- **`src/modules/cart/index.ts`** — Module barrel; re-exports the model and schema for external consumers.
- **Tests** — `schema-contract.test.ts` (unit + integration) asserts the stored shape matches the OpenAPI contract; `retention.test.ts` verifies TTL index configuration; `cart-races.test.ts` exercises the `__v`-based conditional clear under concurrency.

## Notes

- **TTL index is immutable at runtime.** Mongo will not alter an existing index's `expireAfterSeconds`. Changing `NODE_CART_RETENTION_DAYS` and restarting the process causes a hard boot failure (`autoIndex` conflict). The fix is `npm run db:sync` to drop and rebuild the index.
- **`shippingMethodId` is a plain string**, not a DB reference. It names an entry in the in-code `SHIPPING_METHODS` list from the delivery module; `undefined` means "not yet chosen" and a `null` PUT clears it.
- **No endpoint serializes this document directly.** `services/view` assembles `CartResponse` manually; `applyCartTransform` exists solely to satisfy the repository factory's transform contract.
- **`userId` `ref: 'User'` is decorative** — nothing in the cart module `populate()`s it. The ref is for schema documentation only; the unique index is the functional constraint.
