# src/modules/wishlist/demo.ts

## Purpose

Defines the wishlist module's slice of the demo dataset: one seeded wishlist per demo account, each containing only publicly visible products. It also exposes the seed and export functions that `db/demo/index.ts` orchestrates.

## Key elements

- **`wishlistFixtures`** – Array of two wishlist objects built via `makeWishlist`. The admin (`SEED_ADMIN_ID`) holds one product (`micionaOutOfStock`); the user (`SEED_USER_ID`) holds two (`panino`, `pufettino`).
- **`seedWishlistsCollection`** – Upserts every fixture through `wishlistRepository` using `upsertByOwner`, returning `SeedOutcome[]`.
- **`exportSeededWishlists`** – Reads wishlists back from the store (filtered to `userId: 1`) via `exportCollection` on `wishlistModel`, returning a plain record for snapshot/verification.

## Relationships

- **`@kernel/seed-accounts`** – Provides the well-known `SEED_ADMIN_ID` and `SEED_USER_ID` used to tie wishlists to demo accounts.
- **`@modules/products/demo`** – Supplies `SEED_PRODUCT_IDS` so wishlist entries reference the canonical demo product identifiers.
- **`./fixtures`** – `makeWishlist` factory that assembles a wishlist object in the expected shape.
- **`./model`** – `wishlistModel` is passed to `exportCollection` for the read-back query.
- **`./repository`** – `wishlistRepository` is the persistence target for `upsertByOwner`.
- **`@infrastructure/persistence/seed`** – Provides the `SeedOutcome` type and the generic `upsertByOwner` / `exportCollection` helpers.
- **`./module.ts`** – Declares `seedWishlistsCollection` as this module's seed entry point (invoked by `db/demo/index.ts`).

## Notes

- Only **publicly visible** products are seeded. Pointing a wishlist line at a soft-deleted or inactive product (e.g. `carinoSoftDeleted`, `bundleInactive`) would surface as an empty slot in the storefront wishlist page because scoping rules would refuse to return it.
- `panino` is deliberately chosen for the user account because it is **not** in their cart, making the "move to cart" demo transition a real state change.
- `exportSeededWishlists` filters to `userId: 1` (the demo user only), not the admin — see the sibling `../cart/demo` for the same convention.
