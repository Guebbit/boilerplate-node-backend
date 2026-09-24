---
source: src/modules/cart/model.ts
sha256: 7736c847361a4cb50c75a5d232bfe42632c7793e8ee3cc0ea758f20603307a2b
generated_at: 2026-09-23T18:30:48.362109+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema and model for the per-user cart document (one document per `userId`, stored in Mongo as the sole durable copy). It establishes the stored shape, validation bounds, indexes (including TTL-based retention), and the serialization transform that the repository layer needs for lean reads.

## Key elements

- **`CartItem`** — interface for a single cart line (`productId: ObjectId`, `quantity: number`). Stays `ObjectId` in storage; `populate` overwrites it in place, so callers must read the id _before_ populating.
- **`CartDocument`** — extends Mongoose `Document`; adds `userId`, `items: CartItem[]`, and an explicitly-typed `__v: number`. The `__v` field is read by application code (optimistic-concurrency check in `clearLinesIfUnchanged`), not merely maintained by the driver.
- **`CartModel`** — `Model<CartDocument>` type alias. Queries live in `./repository`; business rules in `./service`.
- **`CART_LINE_MAX`** (999) — hard per-line quantity ceiling. Enforced at the schema level (`max`) and is the guard that holds across multiple `'add'`-mode writes where a single-request bound would not.
- **`cartItemSchema`** — subdocument schema with `_id: false` (a generated id would violate the `additionalProperties: false` OpenAPI contract).
- **`cartSchema`** — top-level schema. `userId` is `unique: true`, making "one cart per user" a database invariant and enabling `findOneAndUpdate({ userId }, …, { upsert: true })` as the universal mutation pattern. `timestamps: true` provides `createdAt`/`updatedAt`.
- **Indexes** — `{ 'items.productId': 1 }` (reverse lookup for product deletion) and a TTL index on `updatedAt` (`carts_updatedAt_ttl`, expiry from `NODE_CART_RETENTION_DAYS`, default 365 days).
- **`applyCartTransform`** — built via `applySerialization(cartSchema)`; performs the shared `_id`→`id` / `__v`-removal normalization. Used by the repository factory for lean reads, **not** by any API endpoint (which builds `CartResponse` manually in `./service`).
- **`cartModel`** — the registered Mongoose model (`'Cart'`).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, used to build `applyCartTransform`.
- **`src/infrastructure/runtime/environment.ts`** — provides `environmentNumber`, used to read the TTL retention-days config at import time.
- **`src/modules/cart/repository.ts`** — consumes `cartModel` and `applyCartTransform` for all cart reads/writes; implements `clearLinesIfUnchanged` (the `__v`-based conditional clear).
- **`src/modules/cart/factories.ts`** — wires the repository with the model and transform.
- **`src/modules/cart/index.ts`** — re-exports the model and schema for module-level access.
- **`src/modules/cart/services/reorder.ts`** — reads cart lines (via `readCartLines`) and can push a line toward `CART_LINE_MAX` across multiple `'add'` writes.
- **`src/modules/cart/services/view.ts`** — reads cart lines and their prices to build the `CartResponse` wire shape.
- **`tests/integration/concurrency/cart-races.test.ts`** — exercises the `__v`-conditional clear to verify two parallel checkouts don't double-spend one cart.
- **`src/modules/cart/tests/unit/schema-contract.test.ts`** / **`retention.test.ts`** / **`integration/schema-contract.test.ts`** — assert stored field names, bounds, and TTL behavior match the OpenAPI contract.

## Notes

- **TTL index is immutable in place.** Changing `NODE_CART_RETENTION_DAYS` and restarting will fail boot (`autoIndex` requests the new window; Mongo refuses to alter an existing index). Run `npm run db:sync` to drop and rebuild the index with the new value.
- **`populate` mutates `productId` in place.** Any code that needs the raw `ObjectId` must capture it _before_ calling `populate`. `readCartLines` in the service layer is the single place that handles this correctly.
- **`applyCartTransform` is not an API serializer.** No endpoint returns this shape directly; it exists solely to satisfy the repository-factory contract for lean reads.
- **`_id: false` on cart lines is intentional.** Adding one back would produce an unexpected property in serialized output, violating the OpenAPI schema.
