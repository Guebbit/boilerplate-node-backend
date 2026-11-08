---
source: src/modules/wishlist/repository.ts
sha256: 161e2e8840a998ee099e03b0c21857fcdbba0bd531496036819c55a8e9186bc7
generated_at: 2026-11-08T09:13:51.358537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/repository.ts

## Purpose

Domain-specific CRUD and write operations for the wishlist aggregate, layered on top of the shared `createRepository` factory. It exists so the wishlist service can issue writes (add/remove a line, cascade product or user deletion) without touching Mongoose directly, and so the two cleanup duties owed to product and user deletion live in one place.

## Key elements

- **`wishlistRepository`** — the single export. Typed as `Repository<WishlistDocument, Wire<WishlistDocument>>` plus five domain methods. Spreads the generic factory's CRUD, then overrides/extends with wishlist-specific writes.
- **`findByUserId(userId)`** — returns `WishlistDocument | null`. `null` means the user has no wishlist; the codebase treats that identically to an empty list (no placeholder document is ever created).
- **`addLine(userId, productId)`** — upserts the wishlist document and `$addToSet`-s the product in one `findOneAndUpdate`. Returns `{ wishlist, added }` where `added` is computed from the pre-write snapshot (`returnDocument: 'before'`). No retry loop — see Notes.
- **`removeLine(userId, productId)`** — `$pull`s the product; resolves `null` when the wishlist or the line doesn't exist, letting the service return 404 without a second query.
- **`deleteByUserId(userId, session?)`** — hard-deletes the user's wishlist. Accepts an optional Mongoose `ClientSession` for transactional account deletion.
- **`removeProductFromAll(productId)`** — read-then-pull: `distinct` the owning user IDs, then `updateMany` with `$pull`. Returns the owner IDs as strings so callers can notify them. Tolerates the race window between the two statements (same trade-off as the cart's twin).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, and the `Repository`/`Wire` type contracts. Every method here calls `toObjectId` for input validation; the factory supplies the generic `find`/`create`/`update`/`delete` surface.
- **`src/modules/wishlist/model.ts`** — source of `wishlistModel` (the Mongoose model) and `applyWishlistTransform` (wired into the factory's transform pipeline). `WishlistDocument` type is re-exported for use in this file's signatures.
- **`src/modules/wishlist/service.ts`** — primary consumer; calls every domain method on `wishlistRepository` to implement use-cases (list, add, remove, cascade deletes).
- **`src/modules/wishlist/tests/integration/service.test.ts`** — exercises these methods indirectly through the service; also references the 25-way contention test (`wishlist-races.test.ts`) that pins the `addLine` filter shape.
- **`scenarios/wishlist.ts`** — end-to-end scenario wiring that drives the service (and thus this repository) against a live or seeded database.

## Notes

- **No retry loop, unlike the cart.** `addLine`'s filter is an exact equality on `userId` — the unique index key — so mongod resolves the upsert atomically and E11000 is unreachable. The cart's second step filters on `{ userId, 'items.productId': { $ne } }`, which is *not* an exact match on its unique key, so two concurrent writes can both see "absent"; that is the sole reason the cart retries and the wishlist does not. A 25-way contention test guards this.
- **Explicit type annotation on the export.** Mongoose's generics are too large for TypeScript to infer across an export boundary (TS7056); the full intersection type is written out by hand.
- **`added` is derived from the pre-write snapshot, not `modifiedCount`.** The timestamp bump makes every write a "modification," so `modifiedCount` is useless for this purpose.
- **`removeProductFromAll` is not atomic.** The `distinct` read and the `updateMany` write are two separate operations; a concurrent `addLine` in the gap could re-insert the product. This is the same accepted trade-off as the cart's equivalent.
- **All methods are `async`** even when the underlying call could be synchronous, because `toObjectId` throws synchronously on a malformed string; wrapping in `async` converts that to a rejected promise so the service can map it to a 4xx rather than it bubbling as a 500.
