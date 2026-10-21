/**
 * @module
 * The wishlist's slice of the demo dataset. Only PUBLICLY VISIBLE products are saved — the named
 * ids matter because a line pointing at `heaterSoftDeleted` or `bundleInactive` would render as a
 * hole in the storefront's wishlist page, a product the scoping rules then refuse to return.
 */

import { SEED_ADMIN_ID, SEED_USER_ID } from '@scenarios/accounts';
import { SEED_PRODUCT_IDS } from './product-ids';
import { makeWishlist } from '@modules/wishlist/factories';
import { type SeedOutcome, insertIfAbsentForOwner } from '@scenarios/seed';
import { wishlistRepository } from '@modules/wishlist/repository';

/**
 * The seeded wishlists: one per demo account, holding only publicly visible products.
 *
 * No pinned `_id` — `insertIfAbsentForOwner` keys on `userId`, so an id would buy no idempotency.
 */
const wishlistFixtures = [
    /* root — one saved product, enough for the owner account to show a non-empty page. */
    makeWishlist({
        userId: SEED_ADMIN_ID,
        productIds: [SEED_PRODUCT_IDS.scratchPostOutOfStock]
    }),
    /*
     * customer — two saved products. `dogFoodStandard` is also in no cart of theirs, so moving
     * it to the cart is a state change a demo can actually show happening.
     */
    makeWishlist({
        userId: SEED_USER_ID,
        productIds: [SEED_PRODUCT_IDS.dogFoodStandard, SEED_PRODUCT_IDS.dogBedPremium]
    })
];

/** Seed this collection. Collected into `shopModules` (`./shop-modules`); run by `seedShop`. */
const seedWishlistsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(
        wishlistFixtures.map((wishlist) => insertIfAbsentForOwner(wishlistRepository, wishlist))
    );

/**
 * This module's entry in the `shop` fixture table. Picked up by `npm run regenerate`
 * (`scenarios/shop-modules.generated.ts`), so deleting this file deletes the entry.
 */
export const shopModule = { seed: seedWishlistsCollection };
