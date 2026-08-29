# db/migrations/20260808160000-cart-collection.js

## Purpose

One-shot migration that extracts the cart from the embedded `user.cart` field into a dedicated `carts` collection, normalising the line-item shape (`product` → `productId`, dropping per-item `_id`s) so the stored document matches the wire contract exactly. Both halves ship in a single deploy because the public API contract is unchanged and no client can distinguish pre- from post-migration state.

## Key elements

- **`module.exports.up(db)`** — Copies every non-empty cart into `carts` (upsert keyed on `userId`), mapping `item.product` → `productId` and `cart.updatedAt` → top-level `updatedAt`; sets `createdAt` from the user's own creation date. Then `$unset`s `cart` on all user documents.
- **`module.exports.down(db)`** — Reverses the migration: reads all `carts` documents, writes them back into `users.cart` with the old shape (`productId` → `product`), restores empty-cart documents that were never copied out, and drops the `carts` collection (tolerating "already absent").

## Relationships

No graph neighbours are recorded. This file is a self-contained migration that touches only the `users` and `carts` collections directly via the `db` handle passed in by the runner.

## Notes

- **Idempotent by design.** The upsert on `userId` and the final `$unset` guarantee a second run is a no-op.
- **Empty carts are intentionally skipped on the way up.** The first write in the new world upserts the document into existence, so absence ≡ empty.
- **No indexes are created here.** The cart schema declares them and the application builds them at connect time, keeping index naming in a single source of truth.
- **`createdAt` fallback chain:** `user.createdAt ?? user.cart.updatedAt`. Older accounts may predate the `timestamps` option, so the cart's own `updatedAt` is the next-best proxy.
- **Down-migration restores a default empty cart** (`{ items: [], updatedAt }`) for users who never had items, matching the old schema's default guarantee rather than leaving the field absent.
