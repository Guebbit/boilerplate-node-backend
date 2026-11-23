---
source: scenarios/wishlist.ts
source_sha256: 9386711f048a72feaf1d26659afcf200e6dc344b9b197e79e7eab1aa5fbbb39d
context_sha256: 705ba1a550869430f16d76fa5ea7327b4da961a7ebf0f63ab167ef5a52713fac
generated_at: 2026-11-22T01:50:50.641683+00:00
model: claude-code:claude-sonnet-5-5
---

# scenarios/wishlist.ts

## Purpose
Defines the wishlist portion of the demo dataset. It builds one wishlist per demo account and exposes a seeding function so the shop fixture set can insert them. Only publicly visible products are saved, because a line pointing at a soft-deleted or inactive product (e.g. `heaterSoftDeleted`, `bundleInactive`) would show up as a hole on the storefront wishlist page.

## Key elements
- `wishlistFixtures` (module-private): two `makeWishlist(...)` fixtures.
  - Admin (`SEED_ADMIN_ID`): one product, `scratchPostOutOfStock`.
  - Customer (`SEED_USER_ID`): two products, `dogFoodStandard` and `dogBedPremium`.
  - No `_id` is pinned.
- `seedWishlistsCollection()` (module-private): runs `insertIfAbsentForOwner(wishlistRepository, wishlist)` for each fixture via `Promise.all`. It returns `Promise<SeedOutcome[]>`.
- `shopModule` (exported): `{ seed: seedWishlistsCollection }`. This is the module's entry in the `shop` fixture table.

## Relationships
- `scenarios/accounts.ts`: supplies `SEED_ADMIN_ID` and `SEED_USER_ID`, which are the wishlist owners.
- `scenarios/product-ids.ts`: supplies `SEED_PRODUCT_IDS`, the named product ids used in each wishlist.
- `scenarios/seed.ts`: supplies `insertIfAbsentForOwner` and the `SeedOutcome` type.
- `src/modules/wishlist/factories.ts`: supplies `makeWishlist`, which builds the fixture documents.
- `src/modules/wishlist/repository.ts`: supplies `wishlistRepository`, the target of the inserts.
- `shopModules` (`./shop-modules`) collects `shopModule`, and `seedShop` runs it. Neither is imported here.

## Notes
- Idempotency comes from `insertIfAbsentForOwner`, which keys on `userId`. That is why no `_id` is pinned.
- `npm run regenerate` picks up this module's `shopModule` into the `shop` fixture table (`scenarios/shop-modules.ts`). Deleting this file removes its entry.
- When adding products to these wishlists, use only publicly visible ones. The scoping rules refuse to return soft-deleted or inactive products.
