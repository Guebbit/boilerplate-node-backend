# src/modules/wishlist/demo.ts

## Purpose

Provides the wishlist module's slice of the demo dataset: two seeded wishlists (one per demo user) plus the seed and export functions that `db/demo/index.ts` calls to populate and inspect the collection. The file exists so that the storefront has non-empty wishlist pages for the admin and regular demo users without manual data entry.

## Key elements

- **`wishlistFixtures`** — Array of two wishlist objects built via `makeWishlist`. One belongs to the admin (single product, out-of-stock) and one to the regular user (two products, one of which is also absent from their cart so a "move to cart" demo is possible).
- **`upsertByOwner`** *(internal)* — Looks up an existing wishlist by `userId` via `wishlistRepository.findByUserId`. Returns `'skipped'` if one exists; otherwise calls `wishlistRepository.create` and returns `'created'`.
- **`seedWishlistsCollection`** — Maps `upsertByOwner` over all fixtures and returns the array of `SeedOutcome`s. This is the entry point the demo runner invokes.
- **`exportSeededWishlists`** — Calls `exportCollection(wishlistModel, { userId: 1 })` and returns the stored rows under the key `wishlists`.

## Relationships

- **`@modules/wishlist/factory.ts`** — `makeWishlist` constructs the fixture objects.
- **`@modules/wishlist/model.ts`** — `wishlistModel` is passed to `exportCollection` for the read-back export.
- **`@modules/wishlist/repository.ts`** — `wishlistRepository` is the persistence interface used for the existence check (`findByUserId`) and the create call.
- **`@modules/wishlist/module.ts`** — Declares/exposes `seedWishlistsCollection` so the top-level demo runner can call it.
- **`@modules/products/demo.ts`** — Supplies `SEED_PRODUCT_IDS` used as the `productIds` in each fixture.
- **`@kernel/seed-accounts.ts`** — Supplies `SEED_ADMIN_ID` and `SEED_USER_ID` as the `userId` values.
- **`@infrastructure/persistence/seed.ts`** — Supplies `SEED_SAVE_OPTIONS`, the `SeedOutcome` type, and the generic `exportCollection` helper.

## Notes

- The upsert is keyed by **owner** (`userId`), not by wishlist `id`. This mirrors the convention in `../cart/demo` and means re-seeding is idempotent per user regardless of the fixture's hardcoded ObjectId.
- The docstring explicitly warns that referencing soft-deleted or inactive products (e.g. `carinoSoftDeleted`, `bundleInactive`) would create visible gaps in the storefront because scoping rules refuse to return those products. Stick to publicly visible product IDs when editing the fixtures.
- `exportSeededWishlists` filters on `{ userId: 1 }`—a numeric literal. Verify this matches the actual `SEED_USER_ID` value if the seed accounts change.
