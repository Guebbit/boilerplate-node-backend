---
source: scenarios/wishlist.ts
sha256: aa5e98ef88a763cb22923aa2361f201dcfda91647459f67551320e2a28016594
generated_at: 2026-11-08T02:36:47.812530+00:00
model: ollama:qwen3.8:27b
---

# scenarios/wishlist.ts

## Purpose

Seeds demo wishlist documents for the two demo accounts (admin and customer). It deliberately selects only publicly visible product IDs so that the storefront's wishlist page never renders a hole (a product the scoping rules would refuse to return). The file is one entry in the `shop` fixture table that `seedShop` iterates over.

## Key elements

- **`wishlistFixtures`** — Array of two wishlist objects built with `makeWishlist`. Admin gets one out-of-stock product; customer gets two, one of which is absent from any of their carts (enabling a "move to cart" demo).
- **`seedWishlistsCollection`** — Maps each fixture through `insertIfAbsentForOwner(wishlistRepository, …)` and returns `Promise<SeedOutcome[]>`.
- **`shopModule`** (export) — `{ seed: seedWishlistsCollection }`. Consumed by `npm run regenerate` to build `scenarios/shop-modules.generated.ts`.

## Relationships

- **`scenarios/accounts.ts`** — Supplies `SEED_ADMIN_ID` and `SEED_USER_ID` to bind each wishlist to a demo account.
- **`scenarios/product-ids.ts`** — Supplies `SEED_PRODUCT_IDS` constants used as the `productIds` arrays.
- **`scenarios/seed.ts`** — Provides the `SeedOutcome` type and the `insertIfAbsentForOwner` helper (keyed on `userId` for idempotency).
- **`src/modules/wishlist/factories.ts`** — Provides `makeWishlist`, the domain-object constructor.
- **`src/modules/wishlist/repository.ts`** — Provides `wishlistRepository`, passed to `insertIfAbsentForOwner` as the persistence target.

## Notes

- No `_id` is pinned on the fixtures; idempotency relies entirely on `insertIfAbsentForOwner`'s `userId` key. Adding a fixed id would not improve dedup and could conflict.
- Product selection is intentional and documented inline: `scratchPostOutOfStock` (admin) and `dogFoodStandard` + `dogBedPremium` (customer). Swapping in a soft-deleted or inactive product ID will break the storefront page.
- Deleting this file removes its `shopModule` entry from the generated `shop-modules.generated.ts` on the next `npm run regenerate` run.
