---
source: src/modules/wishlist/repository.ts
sha256: 161e2e8840a998ee099e03b0c21857fcdbba0bd531496036819c55a8e9186bc7
generated_at: 2026-10-15T12:27:18.467196+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/repository.ts

## Purpose

Repository layer for the wishlist module. It combines the standard CRUD surface provided by `createRepository` with the four domain-specific writes a wishlist actually receives (add a line, remove a line, delete for a user, remove a product from all). It exists so the service and tests never touch Mongoose directly.

## Key elements

- **`wishlistRepository`** — the single exported object. Extends `Repository<WishlistDocument, Wire<WishlistDocument>>` (from `createRepository`) and adds four methods.
- **`findByUserId(userId)`** — Fetches a user's wishlist; returns `null` when the document does not exist. No placeholder documents are ever created.
- **`addLine(userId, productId)`** — Upserts a product into the user's wishlist via `findOneAndUpdate` + `$addToSet`. Returns `{ wishlist, added }` where `added` is derived from the `before` snapshot. No retry loop: the filter is an exact equality on the `userId` unique key, so mongod resolves the upsert atomically and E11000 cannot surface.
- **`removeLine(userId, productId)`** — `findOneAndUpdate` with `$pull`; resolves `null` when the wishlist is absent *or* the product is not in it, letting the caller 404 without a second query.
- **`deleteByUserId(userId, session?)`** — Hard-deletes the wishlist document (account deletion path). Accepts an optional Mongoose `ClientSession` for transactional use.
- **`removeProductFromAll(productId)`** — Removes a product from every wishlist holding it and returns the affected `userId`s (as strings) so the service can notify owners.

## Relationships

- **`src/modules/wishlist/model.ts`** — Imports `wishlistModel` (the Mongoose model) and `applyWishlistTransform` (the wire-to-domain transform passed to `createRepository`); also imports the `WishlistDocument` type.
- **`src/infrastructure/persistence/create-repository.ts`** — Imports `createRepository` (standard CRUD factory), `toObjectId` (safe id coercion that throws on malformed input), and the `Repository` / `Wire` type helpers.
- **`src/modules/wishlist/service.ts`** — Consumes `wishlistRepository`; the `null` return from `removeLine` is what lets it answer 404 without a second round-trip.
- **`src/modules/wishlist/tests/integration/service.test.ts`** — Integration tests that exercise the repository through the service layer.
- **`scenarios/wishlist.ts`** — Higher-level scenario file that depends (transitively or directly) on this repository's contract.

## Notes

- **No retry loop (unlike cart).** The `addLine` upsert filter is `{ userId }`, an exact match on the schema's unique index key. Two concurrent upserts on the same key are serialized by mongod; the cart's second-step filter is `{ userId, 'items.productId': { $ne } }`, which is *not* a unique-key equality, so it can lose a race and needs a retry. Verified under 25-way contention in `tests/integration/wishlist-races.test.ts`.
- **`added` flag comes from the `before` snapshot.** `modifiedCount` is useless here because the timestamp bump makes every write count as a modification; only the pre-write document state tells you whether the line was new.
- **Explicit type annotation on the export.** Mongoose's generics are too large for TS to infer at an export boundary (error TS7056), so the type is written out by hand.
- **`removeProductFromAll` has a read-then-pull gap.** The `distinct` read and the `updateMany` pull are two separate operations; a product deleted between them simply won't appear in the returned owner list. Same tolerance as the cart's equivalent.
- **`toObjectId` throws on bad ids.** Every method is `async` partly because this coercion runs synchronously in the filter assembly; a malformed id becomes a thrown error (→ 4xx) rather than a silent no-op (→ 500).
