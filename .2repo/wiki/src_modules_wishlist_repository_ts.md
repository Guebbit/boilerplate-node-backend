# src/modules/wishlist/repository.ts

## Purpose

Data-access layer for the Wishlist domain. It wires the Mongoose model to the rest of the module by combining the shared base-repository factory (standard CRUD + serialization) with the four domain-specific write operations a wishlist actually needs. Every write is keyed by `userId` (a unique index), so no caller ever reads before writing.

## Key elements

- **`wishlistRepository`** (exported const) — typed as `BaseRepository<WishlistDocument>` plus four custom methods. The type is spelled out explicitly to sidestep TS7056 (Mongoose generics are too large for inference at an export boundary).
- **`findByUserId`** — `findOne` on `userId`; resolves `null` when the user has no wishlist (same state as an empty list; no placeholder docs are ever created).
- **`addLine`** — `findOneAndUpdate` with `$addToSet` + `upsert: true`. Atomic: the set prevents duplicate lines, and the equality filter on the unique `userId` key lets mongod resolve the upsert without an E11000 race.
- **`removeLine`** — `findOneAndUpdate` with `$pull`; resolves `null` if the wishlist or the line is absent, so the service can return 404 without a second query.
- **`deleteByUserId`** — hard `deleteOne`; used during account deletion to prevent orphaned wishlists.
- **`removeProductFromAll`** — `updateMany` + `$pull`; called when a product is deleted to clean up every wishlist that referenced it.

## Relationships

- **`src/infrastructure/persistence/base-repository.ts`** — supplies `createBaseRepository` (spread into the exported object for generic CRUD), `toObjectId` (used in every filter to convert strings to ObjectIds), and the `BaseRepository` type contract.
- **`src/modules/wishlist/model.ts`** — provides `wishlistModel` (the Mongoose model), `applyWishlistTransform` (serialization hook passed to the base factory), and the `WishlistDocument` type.
- **`src/modules/wishlist/service.ts`** — primary consumer; calls the repository's domain methods and translates `null` results into 404s.
- **`src/modules/wishlist/tests/integration/service.test.ts`** — integration tests that exercise the repository indirectly through the service.
- **`src/modules/wishlist/demo.ts`** — seed/demo path that imports the repository to create sample data.

## Notes

- **No retry loop** (unlike the cart repository). Two design facts make it unnecessary: `$addToSet` makes the line-add idempotent, and the upsert filter is an exact equality on the unique `userId` key, which mongod resolves atomically. A concurrency regression test (`tests/integration/concurrency/wishlist-races.test.ts`, 25-way contention) guards the filter shape.
- **`null` is meaningful**: both `findByUserId` and `removeLine` use `null` to signal absence rather than an empty object. Callers must handle it.
- **All methods are `async`** because `toObjectId` throws on malformed input; the base-repository docs explain the 4xx-vs-500 rationale.
- **`deleteByUserId`** has an explicit `.then(() => {})` to coerce the Mongoose promise to a `void` return type.
