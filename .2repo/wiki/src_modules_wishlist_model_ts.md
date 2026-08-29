# src/modules/wishlist/model.ts

## Purpose

Defines the Mongoose schema, document interfaces, and registered model for the wishlist collection. A wishlist is a per-user document keyed by `userId` (same isolation rationale as the cart), where each line carries only a `productId`—deliberately no quantity—because "do I want this" is the only question a wishlist answers.

## Key elements

- **`WishlistItem`** (interface) — single-field line: `{ productId: Types.ObjectId }`.
- **`WishlistDocument`** (interface) — extends `Document`; adds `userId`, `items: WishlistItem[]`, `createdAt?`, `updatedAt?`. No separate contract type: the wire shape is just `{ items }`.
- **`WishlistModel`** (type) — `Model<WishlistDocument>`; queries live in `./repository`, business rules in `./service`.
- **`wishlistItemSchema`** — sub-schema for one line; `_id: false` so no stray subdocument id can leak into the OpenAPI contract (`additionalProperties: false`).
- **`wishlistSchema`** — top-level schema; `userId` is `unique: true` (one wishlist per user enforced at the DB level), `items` defaults to `[]`, `timestamps: true`.
- **Index on `items.productId`** — unnamed (no competing derived name); exists so product deletion can locate affected wishlists without a collection scan.
- **`applyWishlistTransform`** — wraps `applySerialization(wishlistSchema)` to normalize lean reads (`_id` → `id`, drops `__v`); used by the base repository factory.
- **`wishlistModel`** — the registered Mongoose model (`'Wishlist'`).

## Relationships

- **`src/infrastructure/persistence/serialize.ts`** — provides `applySerialization`, consumed here to build `applyWishlistTransform`.
- **`src/modules/wishlist/repository.ts`** — sole consumer of `wishlistModel` for all reads/writes (documented in the `WishlistModel` type comment). Every mutation is a single `findOneAndUpdate` with `upsert: true`, made safe by the `unique` index on `userId`.
- **`src/modules/wishlist/service.ts`** — reads `productId` values before any populate (same discipline as cart's `readCartLines`); owns the `move-to-cart` transition rule.

## Notes

- Lines are **never** addressed by a subdocument id (`_id: false`). If you need to identify a line, use `productId`.
- The model is intentionally minimal. Any field that implies quantity belongs in the cart model, not here.
- `userId` uniqueness means "delete then re-create" is impossible without an explicit delete; the upsert pattern in the repository handles the normal path.
- The `items.productId` index is unindexed-by-name (no explicit `name` option) because no other code path creates an index on that field—avoids Mongoose's auto-derived name colliding with a manual one.
