# src/modules/wishlist/repository.ts

## Purpose

Data-access layer for the Wishlist domain. Wraps Mongoose operations behind a typed repository interface, combining the generic CRUD provided by `createRepository` with three domain-specific writes (add line, remove line) and two cleanup writes triggered by product/user deletion. Exists so the service layer never touches Mongoose directly.

## Key elements

- **`wishlistRepository`** — the single exported object. Its type is `Repository<WishlistDocument>` plus five domain methods; the full type is spelled out inline because Mongoose's generics are too large for TS to infer at an export boundary (TS7056).
- **`findByUserId(userId)`** — `findOne` by user; returns `null` if the user has never saved a wishlist (no placeholder documents are ever created).
- **`addLine(userId, productId)`** — `findOneAndUpdate` with `{ upsert: true, returnDocument: 'after' }` and `$addToSet`. The filter is an exact equality on `userId` (the unique index key), so the upsert is atomic and cannot collide with itself — no retry loop is needed (unlike the cart).
- **`removeLine(userId, productId)`** — `findOneAndUpdate` with `$pull`. Resolves `null` when the wishlist or the line is absent, letting the caller return 404 without a second query.
- **`deleteByUserId(userId)`** — `deleteOne`; used by account-deletion flows.
- **`removeProductFromAll(productId)`** — `updateMany` + `$pull`; used when a product is hard-deleted.
- All methods are `async` because `toObjectId` (from `create-repository`) throws on malformed ids, converting what would be a Mongoose 500 into a 4xx at the boundary.

## Relationships

- **`./model.ts`** — provides `wishlistModel` (the Mongoose model) and `applyWishlistTransform` (the transform passed into `createRepository`).
- **`@infrastructure/persistence/create-repository`** — provides the `createRepository` factory (standard find/get/insert/update/delete), `toObjectId` validation helper, and the `Repository` type contract.
- **`./service.ts`** — the primary consumer; calls the domain methods and maps `null` results to HTTP status codes.
- **`./demo.ts`** — exercises the repository for local/demo purposes.
- **`./tests/integration/service.test.ts`** — integration tests that exercise the repository through the service.

## Notes

- **No retry loop.** Unlike `../cart/repository.ts`'s `upsertLine`, `addLine` does not retry. The cart's second-step filter (`{ userId, 'items.productId': { $ne } }`) is *not* an exact match on its unique key, so two concurrent writes can both see "absent" and one loses. Wishlist's filter is an exact equality on the unique `userId`, which mongod resolves atomically. A regression test (`tests/integration/concurrency/wishlist-races.test.ts`, 25-way contention) would go red if the filter ever stopped being an equality.
- **No placeholder documents.** `findByUserId` returning `null` and an empty `items` array are intentionally distinct states; no code path creates an empty wishlist document.
- **`$addToSet` makes `addLine` idempotent** — adding a product that is already present is a no-op that returns the document, not an error.
