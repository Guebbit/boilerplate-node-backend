---
source: src/modules/wishlist/model.ts
sha256: 8ce51007de989cfc84b2843cbe52b967f0a9b6299b469a3e12e3265c72b26e46
generated_at: 2026-09-23T19:47:20.959764+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/model.ts

## Purpose

Defines the Mongoose schema, document interfaces, and model for the wishlist collection. A wishlist is a per-user document (`userId` → `{ items: [{ productId }] }`) with no quantity — it exists solely to track "which products does this user want?" so that the moment an amount matters the item moves to the cart. All persistence shape (indexes, serialization, uniqueness guarantees) is established here.

## Key elements

- **`WishlistItem`** — interface for one line: `{ productId: Types.ObjectId }`. No other fields by design.
- **`WishlistDocument`** — full document shape: `userId` (unique), `items: WishlistItem[]`, optional `createdAt`/`updatedAt`.
- **`WishlistModel`** — type alias (`Model<WishlistDocument>`) for use in repository signatures.
- **`wishlistItemSchema`** — sub-schema with `_id: false`, keeping subdocs clean for serialization.
- **`wishlistSchema`** — main schema; `unique: true` on `userId` enforces one-wishlist-per-user at the DB level, enabling single-statement `findOneAndUpdate` upserts. `timestamps: true`.
- **Index on `items.productId`** — unnamed (Mongoose-derived); lets product-deletion lookups avoid a collection scan.
- **`applyWishlistTransform`** — built via `applySerialization(wishlistSchema)`; maps `_id`→`id` and strips `__v` on lean reads.
- **`wishlistModel`** — the registered Mongoose model instance (entrypoint for repository imports).

## Relationships

- **`@infrastructure/persistence/serialize`** — `applySerialization` is imported and applied to produce `applyWishlistTransform`.
- **`./repository`** — owns all queries against `wishlistModel`; this file supplies the schema, document type, and transform.
- **`./service`** — business rules (move-to-cart, idempotent `$addToSet`) operate on the types defined here.
- **`./factories`** — constructs `WishlistItem` / document instances from domain inputs.
- **`./index`** — barrel re-exports the public symbols of this file.
- **`schema-contract.test.ts`** — asserts the schema shape (field names, `_id: false`, unique constraint) against the OpenAPI contract.
- **`wishlist-races.test.ts`** — exercises concurrent `findOneAndUpdate({ userId }, …, { upsert: true })` to verify the uniqueness guarantee prevents duplicate documents.

## Notes

- `items` subdocs have **no `_id`**. This is load-bearing: the OpenAPI `WishlistItem` schema declares `additionalProperties: false`, so a generated ObjectId would be a contract violation if ever serialized.
- There is **no contract-type** (e.g. a `WishlistResponse` base) that `WishlistDocument` extends. The wire shape `{ items }` is a projection, not the stored document.
- The `productId` field uses `ref: 'Product'` but the model never auto-populates; the service is responsible for resolving ids after lean reads.
- The index on `items.productId` is intentionally unnamed — no code references it by name, so Mongoose's auto-derived name is sufficient.
