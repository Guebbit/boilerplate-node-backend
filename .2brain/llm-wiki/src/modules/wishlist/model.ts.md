---
source: src/modules/wishlist/model.ts
sha256: c53c0752a9b45b4cca1a5b9a51fd5abcecf9a9357e093db734c2e7870cb1e6d3
generated_at: 2026-11-08T09:12:54.849769+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/model.ts

## Purpose

Defines the Mongoose schema, TypeScript interfaces, and model singleton for the wishlist entity. Establishes the persisted shape (one document per user holding an array of `{ productId }` lines), enforces the one-wishlist-per-user constraint at the database level, and exposes a serialization transform for lean reads. All queries live in `./repository`; business rules in `./service`.

## Key elements

- **`WishlistItem`** — Interface for a single line; contains only `productId: ObjectId`. No quantity by design.
- **`WishlistDocument`** — Document interface extending Mongoose `Document`: `userId`, `items: WishlistItem[]`, optional timestamps.
- **`WishlistModel`** — Type alias for `Model<WishlistDocument>`; used by the repository for typed queries.
- **`wishlistItemSchema`** — Sub-schema with `_id: false` so no generated subdocument id can leak into serialized output.
- **`wishlistSchema`** — Main schema. `userId` is `unique: true` (enables `findOneAndUpdate` + `upsert` without a prior read). `items` defaults to `[]`. `timestamps: true`.
- **`items.productId` index** — Supports "find every wishlist containing product X" (product-deletion fan-out) without a collection scan.
- **`applyWishlistTransform`** — Built via `applySerialization(wishlistSchema)`; maps `_id` → `id` and strips `__v` on lean reads.
- **`wishlistModel`** — The Mongoose model singleton (`model<WishlistDocument, WishlistModel>('Wishlist', wishlistSchema)`).

## Relationships

- **`@infrastructure/persistence/serialize.ts`** — Provides `applySerialization`, consumed here to build `applyWishlistTransform`.
- **`./repository.ts`** — Consumes `wishlistModel` and `applyWishlistTransform` for all read/write operations.
- **`./factories.ts`** — Wires the repository factory using the model and transform exported here.
- **`./service.ts`** — Relies on `WishlistItem` / `WishlistDocument` types for business-logic signatures.
- **`./presenter.ts`** — Maps `WishlistDocument` to the `WishlistResponse` view shape.
- **`./index.ts`** — Barrel re-exports the public types and model from this file.
- **`./tests/unit/schema-contract.test.ts`** — Asserts the schema shape matches the OpenAPI `WishlistItem` contract.
- **`./tests/integration/wishlist-races.test.ts`** — Exercises the upsert/`$addToSet` idempotence guarantees this schema enables.

## Notes

- **`_id: false` on items is contractual**, not cosmetic: the OpenAPI spec declares `additionalProperties: false` on `WishlistItem`, so a generated subdocument id would be a serialization bug.
- **No `quantity` field** is intentional. The moment an amount matters, the item is `move-to-cart`'d and the wishlist line is removed. Keeping the line to a single field is what makes `$addToSet` the entire idempotence story.
- **`productId` stays an `ObjectId`** in this file — no `.populate()` here. Population (if any) is the repository's or presenter's concern.
- **The `items.productId` index is unnamed** deliberately, matching the cart's twin; nothing else creates an index on that path, so Mongoose's derived name is unambiguous.
