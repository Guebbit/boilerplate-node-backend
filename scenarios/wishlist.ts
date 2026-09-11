/**
 * @module
 * The wishlist's slice of the demo dataset. Only PUBLICLY VISIBLE products are saved — the named
 * ids matter because a line pointing at `heaterSoftDeleted` or `bundleInactive` would render as a
 * hole in the storefront's wishlist page, a product the scoping rules then refuse to return.
 */

import { SEED_OWNER_ID, SEED_USER_ID } from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS } from './subjects';
import { makeWishlist } from '@modules/wishlist/factories';
import { type SeedOutcome, upsertByOwner } from '@infrastructure/persistence/seed';
import { wishlistRepository } from '@modules/wishlist/repository';

/**
 * The seeded wishlists: one per demo account, holding only publicly visible products.
 *
 * No pinned `_id` — see `./cart`, which explains why the owner-keyed collections differ.
 */
export const wishlistFixtures = [
    /* root — one saved product, enough for the owner account to show a non-empty page. */
    makeWishlist({
        userId: SEED_OWNER_ID,
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

/** Seed this collection. Declared in `./index`; called by `scenarios/apply.ts`. */
export const seedWishlistsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(wishlistFixtures.map((wishlist) => upsertByOwner(wishlistRepository, wishlist)));
