# src/modules/cart/model.ts

## Purpose

Defines the Mongoose schema, document interface, and model for the cart collection. A cart is a standalone document keyed by `userId` (not a subdocument of user) so that reads/writes touch one small document and the serializer never needs to omit fields. Field names mirror the `openapi.yaml` `CartItem` shape so there is no wire↔storage mapper.

## Key elements

- **`CartItem`** — interface for a single cart line: `{ productId: ObjectId, quantity: number }`.
- **`CartDocument`** — extends Mongoose `Document`; adds `userId`, `items: CartItem[]`, timestamps, and an explicitly typed `__v` (Mongoose version key, read by application code for optimistic-concurrency checks at checkout).
- **`CartModel`** — type alias for `Model<CartDocument>`; used by the repository for typed queries.
- **`cartItemSchema`** — subdocument schema for a cart line; `_id: false` because the OpenAPI contract forbids extra properties and a line is addressed by product, never by its own id.
- **`cartSchema`** — top-level schema; `userId` is `unique: true` (enforces one-cart-per-user at the DB level and enables `findOneAndUpdate({ userId }, …, { upsert: true })` for all mutations); `timestamps: true` adds `createdAt`/`updatedAt`.
- **`cartSchema.index({ 'items.productId': 1 })`** — unnamed compound subfield index so "delete product → find all carts holding it" is an indexed scan rather than a collection read.
- **`applyCartTransform`** — calls `applySerialization(cartSchema)` to produce the shared `_id→id` / `__v`-strip transform the base factory expects for lean reads.
- **`cartModel`** — the registered Mongoose model (`model('Cart', cartSchema)`); the single import point for repository and service code.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — imports `applySerialization` to build `applyCartTransform`.
- **`src/modules/cart/repository.ts`** — consumes `cartModel` for all queries; calls `clearLinesIfUnchanged` which relies on the `__v` field declared here for optimistic-concurrency comparison.
- **`src/modules/cart/services/view.ts`** — calls `populate('items.productId')` and reads the raw `productId` before the in-place overwrite; builds the `CartResponse` view from the lines this schema stores.

## Notes

- `populate('items.productId')` mutates the field in place at runtime. Any code that needs the raw `ObjectId` must capture it *before* populating; `services/view.ts` `readCartLines` is the sole place that does this correctly.
- `__v` is typed explicitly (rather than left as `any`) because `repository.clearLinesIfUnchanged` compares it in application logic. The name belongs to Mongoose, not this codebase.
- `applyCartTransform` is **not** an API response serializer — no endpoint returns this shape. It exists solely to satisfy the base-factory contract for lean document reads.
- The `items.productId` index is intentionally unnamed: nothing else in the codebase creates it, so Mongoose's auto-derived name is the only name it will ever have.
- Redis is deliberately not used for carts: it is cache-only (`allkeys-lru`, no persistence) in this stack. The model doc-block explains the trade-off (durability, `productRemoveFromCartsById` as a single indexed query vs. a hand-maintained secondary index).
