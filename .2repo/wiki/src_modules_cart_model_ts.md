# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema, model, and TypeScript interfaces for the per-user cart document. The cart is stored in Mongo as a durable record (Redis is cache-only here), with field names matching the `CartItem` shape in `openapi.yaml` so stored and wire representations are identical.

## Key elements

- **`CartItem`** – Interface for a single cart line: `productId: Types.ObjectId` + `quantity: number`.
- **`CartDocument`** – Full document interface extending Mongoose `Document`; includes `userId`, `items: CartItem[]`, timestamps, and an explicit `__v: number` (declared because app code reads it, not just the driver).
- **`CartModel`** – `Model<CartDocument>` type; queries live in `./repository`, not here.
- **`cartItemSchema`** – Subdocument schema for a line. `_id: false` so no generated id leaks into the `additionalProperties: false` contract. `productId` refs `Product`; `quantity` is `min: 1`.
- **`cartSchema`** – Top-level schema. `userId` is `unique: true` (enforces one-cart-per-user at the DB level, enabling `findOneAndUpdate` upserts). `timestamps: true`. Indexes: `{ 'items.productId': 1 }` (unindexed by default, needed for product-deletion lookups) and a TTL index on `updatedAt` with `expireAfterSeconds` driven by `NODE_CART_RETENTION_DAYS`.
- **`applyCartTransform`** – Result of `applySerialization(cartSchema)`; the normalizer the repository factory requires for lean reads (handles `_id` → `id` and `__v` stripping).
- **`cartModel`** – The Mongoose model entrypoint (`model<CartDocument, CartModel>('Cart', cartSchema)`).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – Provides `applySerialization`, imported here to produce `applyCartTransform`.
- **`src/infrastructure/runtime/environment.ts`** – Provides `environmentNumber`, used to read `NODE_CART_RETENTION_DAYS` at import time for the TTL index.
- **`src/modules/cart/repository.ts`** – Owns all cart queries. Reads `__v` for the conditional `clearLinesIfUnchanged` (optimistic checkout) and returns lines via `applyCartTransform`.
- **`src/modules/cart/services/view.ts`** – Builds the wire `CartResponse` by hand from cart lines and product prices; the raw `CartDocument` shape is never serialized to an endpoint.
- **`src/modules/cart/fixtures.ts` / `demo.ts`** – Consume `cartModel` and `cartSchema` for seeding and demonstration.
- **`src/modules/cart/tests/unit/schema-contract.test.ts`**, **`tests/integration/schema-contract.test.ts`** – Assert schema/field-shape contracts.
- **`src/modules/cart/tests/unit/retention.test.ts`** – Validates TTL-index behavior against `NODE_CART_RETENTION_DAYS`.
- **`tests/integration/concurrency/cart-races.test.ts`** – Exercises the `__v`-based conditional clear to confirm parallel checkouts don't double-spend a cart.

## Notes

- **`populate` clobbers `productId`.** Mongoose `populate('items.productId')` overwrites the ObjectId in place at runtime. Any code that needs the raw id must capture it *before* populating; `readCartLines` in the service layer is the single place that does this.
- **TTL index is `updatedAt`, not `createdAt`.** Any mutation restarts the retention clock; "abandoned" means no changes for the configured period.
- **Changing `NODE_CART_RETENTION_DAYS` after index creation does nothing at runtime.** Mongo does not mutate an existing index's `expireAfterSeconds` on restart—a `collMod` migration is required.
- **No `CartResponse` contract type is extended here.** The wire shape (`{ items, summary }`) is computed in the service layer; the document and the API response are intentionally different types.
- **`__v` is typed as `number` (not `any`)** specifically so the version comparison in `clearLinesIfUnchanged` is type-safe.
