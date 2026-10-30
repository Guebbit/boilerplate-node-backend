---
source: src/modules/wishlist/model.ts
sha256: c53c0752a9b45b4cca1a5b9a51fd5abcecf9a9357e093db734c2e7870cb1e6d3
generated_at: 2026-10-29T06:34:11.325957+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/model.ts

## Purpose

Defines the Mongoose schema, model, and TypeScript interfaces for the per-user wishlist document. It establishes the persisted shape (one document per user, an array of product-only lines), the serialization transform, and the database index needed for reverse product lookups — so that every other file in the wishlist module can assume a single, stable document contract.

## Key elements

- **`WishlistItem`** — interface for a single wishlist line; only `productId: ObjectId`. No quantity by design.
- **`WishlistDocument`** — extends Mongoose `Document`; carries `userId`, `items: WishlistItem[]`, and optional timestamps.
- **`WishlistModel`** — `Model<WishlistDocument>` alias for type-safe model references.
- **`wishlistItemSchema`** — sub-schema with `_id: false` and a required `productId` (ref `Product`).
- **`wishlistSchema`** — top-level schema: `userId` (ref `User`, `unique: true`), `items` (array of item sub-docs, default `[]`), `timestamps: true`. Also registers an index on `items.productId`.
- **`applyWishlistTransform`** — serialization function (built via `applySerialization`) that maps `_id`→`id` and strips `__v`.
- **`wishlistModel`** — the registered Mongoose model (`'Wishlist'`); the single entrypoint other modules import.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, imported here to build `applyWishlistTransform`.
- **`src/modules/wishlist/factories.ts`** — consumes `applyWishlistTransform` to wire lean-read normalization into the repository factory.
- **`src/modules/wishlist/repository.ts`** — imports `wishlistModel` (and types) to issue `findOneAndUpdate` queries; owns all read/write operations.
- **`src/modules/wishlist/service.ts`** — applies business rules (e.g. move-to-cart) on top of the repository; reads `productId` before any populate.
- **`src/modules/wishlist/presenter.ts`** — shapes `WishlistDocument` data into the wire `WishlistResponse` view.
- **`src/modules/wishlist/index.ts`** — barrel re-export of this module's public surface.
- **`src/modules/wishlist/tests/unit/schema-contract.test.ts`** — asserts the schema's field-level contract (required fields, types, `_id: false`).
- **`src/modules/wishlist/tests/integration/wishlist-races.test.ts`** — exercises concurrent upsert idempotence that relies on the unique `userId` index and `$addToSet` semantics.

## Notes

- `_id: false` on item sub-docs is deliberate: the OpenAPI contract declares `additionalProperties: false` on `WishlistItem`, so a generated sub-document `_id` would be a contract violation if serialized.
- `unique: true` on `userId` is the enforcement mechanism for "one wishlist per user"; it lets every mutation be a single `findOneAndUpdate(…, { upsert: true })` with no preceding read.
- The `items.productId` index is intentionally unnamed — nothing else creates an index with the same name, so Mongoose's auto-derived name causes no conflict (same convention as the cart module).
- No quantity field exists on a wishlist line by design; the moment an amount matters, the item is moved to the cart. This is what makes `$addToSet` sufficient for idempotent insertion.
- A wishlist document id never reaches the wire — the response is the items array, not the document.
