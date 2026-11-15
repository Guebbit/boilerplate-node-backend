---
source: src/modules/wishlist/repository.ts
sha256: 5a5131965595e9a3c68d46ff1dd42103b65dfa0c10f3edd74485ab9fa0a10c86
generated_at: 2026-11-14T22:53:44.081383+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/repository.ts

## Purpose

Defines the wishlist data-access layer: a standard CRUD repository (via `createRepository`) extended with the four domain-specific writes a wishlist actually takes—add a line, remove a line, delete on user removal, and strip a product from all lists. It exists so the service layer never touches Mongoose directly and so the `addLine` race is settled in a single atomic statement rather than a read-modify-write loop.

## Key elements

- **`WISHLIST_LIMIT_REACHED`** — exported sentinel string; `addLine` resolves it (instead of throwing) when the list is at capacity and the product is not already in it.
- **`wishlistRepository`** — the sole export besides the sentinel. Spread-in methods from `createRepository` (standard CRUD) plus:
  - `findByUserId(userId)` → `WishlistDocument | null`; `null` means the user has no wishlist (no placeholder doc is ever created).
  - `addLine(userId, productId)` → `{ wishlist, added }` or `WISHLIST_LIMIT_REACHED`. Uses a single `findOneAndUpdate` with an aggregation pipeline that conditionally appends only when the product is absent **and** the list is under `wishlistMax()`. The pre-update document (`returnDocument: 'before'`) determines whether `added` is `true`.
  - `removeLine(userId, productId)` → `WishlistDocument | null`; `null` covers both "no wishlist" and "product not in list" (single query, no second round-trip for the service to 404).
  - `deleteByUserId(userId, session?)` → `void`; hard-deletes the document (account deletion path).
  - `removeProductFromAll(productId)` → `string[]` of affected user IDs; distinct-read then `updateMany($pull)`.
- **Explicit interface annotation** on `wishlistRepository` — written out because Mongoose generics are too large for TS to serialize an inferred type at an export boundary (TS7056).

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — provides `createRepository`, `toObjectId`, and the `Repository`/`Wire` types that form the base of `wishlistRepository`.
- **`src/modules/wishlist/model.ts`** — supplies `wishlistModel` (the Mongoose model) and `applyWishlistTransform` (the document→wire transform passed to the base factory).
- **`src/modules/wishlist/config.ts`** — supplies `wishlistMax()`, the capacity ceiling checked inside `addLine`.
- **`src/modules/wishlist/service.ts`** — the consumer that calls `addLine`, `removeLine`, `findByUserId`, and delegates `deleteByUserId` / `removeProductFromAll` to this repository.
- **`src/modules/wishlist/tests/integration/service.test.ts`** — exercises the repository through the service in integration tests.
- **`scenarios/wishlist.ts`** — scenario definitions that drive the repository through realistic user flows.

## Notes

- **No retry loop (unlike cart).** The `addLine` upsert filters on `{ userId }`—an exact match on the unique-index key—so mongod resolves it atomically and no `E11000` can surface. The cart's equivalent filters on `{ userId, 'items.productId': { $ne } }`, which is *not* a unique-key equality, so two concurrent saves can both see "absent" and one loses; that is the sole reason the cart needs a retry budget and this one does not.
- **`addLine` uses an aggregation pipeline update.** The `$cond` inside `$set.items` tests the document *as mongod holds it* at write time, making the append-and-cap-check a single atomic operation. `updatePipeline: true` is required or Mongoose rejects the array update.
- **`added` is derived from the pre-update doc, not `modifiedCount`.** Every write bumps the timestamp, so `modifiedCount` is always ≥ 1 and cannot distinguish "new line" from "already present."
- **All methods are `async`.** Each calls `toObjectId`, which throws synchronously on a malformed string; making the method `async` converts that into a rejected promise so the caller can map it to a 4xx rather than an uncaught 500.
- **`removeProductFromAll` is read-then-write.** The `distinct` and `updateMany` are two separate operations; a product added to a wishlist in that gap will be missed. The same tolerance exists in the cart's twin; it is accepted as a known trade-off.
