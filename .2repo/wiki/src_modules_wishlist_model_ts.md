# src/modules/wishlist/model.ts

## Purpose

Defines the Mongoose schema, model, and serialization transform for the per-user wishlist collection. A wishlist is a single document keyed by `userId` whose payload is a flat list of `{ productId }` entries—no quantity, no sub-identity—so that idempotent upserts via `$addToSet` are the entire mutation story.

## Key elements

- **`WishlistItem`** – interface for one line: a single `productId: Types.ObjectId`.
- **`WishlistDocument`** – extends `Document`; fields: `userId`, `items: WishlistItem[]`, `createdAt?`, `updatedAt?`.
- **`WishlistModel`** – type alias for `Model<WishlistDocument>`; used to annotate the repository/service.
- **`wishlistItemSchema`** – sub-document schema with `_id: false`; enforces `productId` as required `ObjectId` ref to `Product`.
- **`wishlistSchema`** – top-level schema; `userId` is `unique: true` (one wishlist per user, enforced at the DB level); `items` defaults to `[]`; `timestamps: true`.
- **`items.productId` index** – unnamed compound field index so a "delete product" query can find every wishlist containing it without a collection scan.
- **`applyWishlistTransform`** – serialization function (produced by `applySerialization(wishlistSchema)`) that maps `_id` → `id` and strips `__v` for lean reads.
- **`wishlistModel`** – the registered Mongoose model (`model('Wishlist', …)`); the single entry point for runtime access.

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** – provides `applySerialization`, which this file calls to build `applyWishlistTransform`.
- **`src/modules/wishlist/repository.ts`** – imports the model/schema; owns all `findOneAndUpdate` / query operations against `wishlistModel`.
- **`src/modules/wishlist/service.ts`** – imports the model types; applies business rules (e.g. move-to-cart, validation) before delegating persistence to the repository.
- **`src/modules/wishlist/fixtures.ts`** – imports the model to build in-memory or seeded test data.
- **`src/modules/wishlist/demo.ts`** – imports the model for seeding demo/development data.
- **`src/modules/wishlist/tests/unit/schema-contract.test.ts`** – asserts schema shape, index presence, and serialization contract.
- **`tests/integration/concurrency/wishlist-races.test.ts`** – exercises the `unique: true` + upsert path under concurrent writes.

## Notes

- **`_id: false` on `WishlistItem`** is deliberate: the OpenAPI `WishlistItem` schema is `additionalProperties: false`, so a Mongoose-generated subdocument `_id` would be a contract violation the moment it is serialized.
- **`unique: true` on `userId`** (not a separate compound index) is what allows every mutation to be a single `findOneAndUpdate({ userId }, …, { upsert: true })` with no prior read—no read-modify-write race window.
- **The `items.productId` index is intentionally unnamed.** The comment explains that nothing else creates an index with a derived name, so leaving it unnamed avoids a potential naming collision with Mongoose's auto-derived index name.
- **No quantity field** is a design decision, not an omission: the moment an amount matters, the item is expected to move into the cart via `POST /wishlist/{productId}/move-to-cart`.
- **`applyWishlistTransform`** is the hook the repository's `create-repository` factory calls for lean reads; the service never sees raw Mongoose documents.
