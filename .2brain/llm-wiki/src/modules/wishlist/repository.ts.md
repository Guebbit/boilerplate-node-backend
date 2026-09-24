---
source: src/modules/wishlist/repository.ts
sha256: 460a94a7c647ebee0be3228b2c1708d078d954e975a5a04a775045e871b8b8f3
generated_at: 2026-09-23T19:48:09.295194+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/repository.ts

## Purpose

Repository layer for the wishlist module. Exposes the standard CRUD surface (inherited from the shared factory) plus the three domain writes a wishlist actually takes — add a line, remove a line, and the two cleanup writes owed to product and user deletion. All writes are single atomic Mongoose operations; there is no retry loop.

## Key elements

- **`wishlistRepository`** — the sole export. Combines `createRepository` (standard CRUD) with five domain methods. Its type is written out explicitly (not inferred) to work around TS7056 on Mongoose's large generics at the export boundary.
- **`findByUserId(userId)`** — Returns the user's `WishlistDocument` or `null`. `null` and an empty list are the same state; no placeholder document is ever created.
- **`addLine(userId, productId)`** — `findOneAndUpdate` with `$addToSet` + upsert. The filter is an exact equality on `userId` (the unique-index key), so the upsert is atomic and no E11000 can reach the caller.
- **`removeLine(userId, productId)`** — `findOneAndUpdate` with `$pull`. Resolves `null` when the wishlist is absent or does not contain the product, letting the service return 404 without a second query.
- **`deleteByUserId(userId)`** — Hard-deletes the wishlist (account-deletion cleanup). Returns `void`.
- **`removeProductFromAll(productId)`** — `$pull` across every wishlist holding the product (product-deletion cleanup). Returns Mongoose's `UpdateWriteOpResult`.

## Relationships

- **`src/modules/wishlist/model.ts`** — Provides `wishlistModel`, `applyWishlistTransform`, and the `WishlistDocument` type that this file imports.
- **`src/infrastructure/persistence/create-repository.ts`** — Provides the `createRepository` factory, the `toObjectId` guard, and the `Repository` / `Wire` types spread into the export.
- **`src/modules/wishlist/service.ts`** — Primary consumer; calls the domain methods and maps results to HTTP semantics.
- **`scenarios/wishlist.ts`** — Exercises the repository end-to-end via the service.
- **`src/modules/wishlist/tests/integration/service.test.ts`** — Integration tests that hit the repository through the service layer.

## Notes

- **No retry loop (unlike the cart).** The cart's `upsertLine` filters on `{ userId, 'items.productId': { $ne } }`, which is *not* an exact match on the unique key, so two concurrent upserts can both see "absent" and one loses. Here the filter is `{ userId: <objectId> }` — the unique key itself — so mongod resolves it atomically. Concurrency is validated at 25-way contention in `tests/integration/concurrency/wishlist-races.test.ts`.
- **All methods are `async`** because each calls `toObjectId`, which *throws* on a malformed id. This converts a bad input into a 4xx at the service boundary rather than a 500 from Mongoose.
- **`null` ≠ error.** Both `findByUserId` and `removeLine` return `null` for "not found" cases; the service is responsible for the 404 mapping.
