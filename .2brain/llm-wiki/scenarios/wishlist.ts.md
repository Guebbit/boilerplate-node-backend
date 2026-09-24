---
source: scenarios/wishlist.ts
sha256: c39bf15d4edbd7129e4a1eaa23b769d7e9ef781d668dcc67c50c1d0bd927cfa9
generated_at: 2026-09-23T17:21:08.656517+00:00
model: ollama:qwen3.8:27b
---

# scenarios/wishlist.ts

## Purpose

Defines the wishlist slice of the demo seed dataset. It produces one wishlist per demo account, deliberately containing only publicly visible products, and exposes the seeding routine that `seedShop` walks to populate the wishlist collection.

## Key elements

- **`wishlistFixtures`** — Array of two wishlist objects built via `makeWishlist`. The admin account holds one product (`scratchPostOutOfStock`); the customer account holds two (`dogFoodStandard`, `dogBedPremium`). No explicit `_id` is set.
- **`seedWishlistsCollection`** — `Promise<SeedOutcome[]>` function that maps each fixture through `insertIfAbsentForOwner(wishlistRepository, …)` and resolves with all outcomes. Registered in `scenarios/index.ts`'s `shopModules` array.

## Relationships

- **`scenarios/accounts.ts`** — Supplies `SEED_ADMIN_ID` and `SEED_USER_ID` as the `userId` ownership key for each fixture.
- **`scenarios/subjects.ts`** — Supplies `SEED_PRODUCT_IDS` (specifically `scratchPostOutOfStock`, `dogFoodStandard`, `dogBedPremium`) so fixtures reference real, visible products.
- **`scenarios/seed.ts`** — Provides the `SeedOutcome` type and the `insertIfAbsentForOwner` helper that gives per-user idempotency.
- **`scenarios/index.ts`** — Consumes `seedWishlistsCollection` as part of the `shopModules` collection walked by `seedShop`.
- **`src/modules/wishlist/factories.ts`** — Source of `makeWishlist`, the domain factory used to build each fixture object.
- **`src/modules/wishlist/repository.ts`** — Source of `wishlistRepository`, passed to `insertIfAbsentForOwner` as the persistence target.

## Notes

- **Visibility constraint is load-bearing.** The module doc-block explicitly warns that referencing a soft-deleted or inactive product id (e.g. `heaterSoftDeleted`, `bundleInactive`) would create a "hole" in the storefront wishlist page, because scoping rules would refuse to return that product. Stick to `SEED_PRODUCT_IDS` entries that are publicly visible.
- **Idempotency is keyed on `userId`, not `_id`.** Adding a fixed `_id` to a fixture would not improve idempotency because `insertIfAbsentForOwner` matches on owner; it would only risk a duplicate-key collision on re-seed.
- **`dogFoodStandard` is intentionally absent from the customer's cart**, so a "move wishlist item to cart" demo produces a visible state change.
