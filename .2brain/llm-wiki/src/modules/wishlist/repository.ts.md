---
source: src/modules/wishlist/repository.ts
sha256: 145e1d8e2fd27dc842c8716fd23b4674ea9f36c0611344063d4091983f3de8fa
generated_at: 2026-09-27T15:46:18.863308+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/repository.ts

## Purpose

Domain-specific persistence layer for the Wishlist module. It extends the generic `createRepository` factory with the four writes a wishlist actually takes (add line, remove line, delete-by-user, remove-product-from-all) and a targeted read (`findByUserId`). Every document is addressed by `userId` (the unique index key), so no caller ever reads before writing.

## Key elements

- **`wishlistRepository`** (exported const) — the only export. A `Repository<WishlistDocument, Wire<WishlistDocument>>` augmented with five domain methods. The type is written out explicitly because Mongoose's generics exceed TypeScript's inference budget at an export boundary (TS7056).
- **`findByUserId`** — single-read by `userId`; returns `null` when the user has no wishlist (no placeholder document is ever created).
- **`addLine(userId, productId)`** — `findOneAndUpdate` with `{ upsert: true, returnDocument: 'after' }` and `$addToSet`. Atomic because the filter is an exact equality on the unique `userId` key; no retry loop is needed (contrast with cart's `upsertLine`).
- **`removeLine(userId, productId)`** — `findOneAndUpdate` filtering on both `userId` and `'items.productId'`, pulling the line. Returns `null` if either condition fails, letting the service emit a 404 without a second query.
- **`deleteByUserId(userId, session?)`** — hard delete for account removal; accepts an optional Mongoose `ClientSession`.
- **`removeProductFromAll(productId)`** — `updateMany` + `$pull` across every wishlist that references the product; used on product deletion.

## Relationships

- **`src/infrastructure/persistence/create-repository.ts`** — supplies the base `createRepository` factory, the `toObjectId` helper (which throws on malformed IDs, turning what would be a 500 into a 4xx), and the `Repository` / `Wire` type aliases. The base CRUD is spread into `wishlistRepository`.
- **`src/modules/wishlist/model.ts`** — provides `wishlistModel` (the Mongoose model), `applyWishlistTransform` (wire ↔ domain mapping passed to `createRepository`), and the `WishlistDocument` type.
- **`src/modules/wishlist/service.ts`** — consumes `wishlistRepository`; calls `findByUserId`, `addLine`, `removeLine`, and delegates cleanup writes (`deleteByUserId`, `removeProductFromAll`) to their respective domain flows.
- **`src/modules/wishlist/tests/integration/service.test.ts`** — integration tests that exercise the repository through the service, including 25-way concurrency tests for the `addLine` upsert race.
- **`scenarios/wishlist.ts`** — end-to-end scenario definitions that drive wishlist operations.

## Notes

- **No retry loop.** The cart repository retries `upsertLine` because its second-step filter (`{ userId, 'items.productId': { $ne } }`) is *not* an exact match on the unique key, so two concurrent upserts can both see "absent." The wishlist's filter is an exact equality on `userId` (the unique key itself), so mongod resolves it atomically and E11000 is impossible.
- **`null` ≠ empty list.** `findByUserId` returning `null` and returning a document with `items: []` are semantically identical to callers; no write path creates a placeholder document.
- **All methods are `async`** even though some (e.g. `deleteByUserId`) are thin wrappers, because `toObjectId` can throw on a malformed ID and that throw must surface as a 4xx, not a 500.
- **Session-aware only for `deleteByUserId`.** That is the only method accepting a `ClientSession`, reflecting that it participates in the transactional account-deletion flow.
