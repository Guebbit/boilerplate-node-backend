/**
 * @module
 * The wishlist's slice of the demo dataset. Only PUBLICLY VISIBLE products are saved — the named
 * ids matter because a line pointing at `heaterSoftDeleted` or `bundleInactive` would render as a
 * hole in the storefront's wishlist page, a product the scoping rules then refuse to return.
 */

import { SEED_OWNER_ID, SEED_USER_ID } from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS } from './products';
import { makeWishlist } from '@modules/wishlist/factories';
import { wishlistModel } from '@modules/wishlist/model';
import {
    type SeedOutcome,
    exportCollection,
    upsertByOwner
} from '@infrastructure/persistence/seed';
import { wishlistRepository } from '@modules/wishlist/repository';

/** The seeded wishlists: one per demo account, holding only publicly visible products. */
export const wishlistFixtures = [
    /* root — one saved product, enough for the owner account to show a non-empty page. */
    makeWishlist({
        id: '65dd2cb27c5e8a1f3b9d4602',
        userId: SEED_OWNER_ID,
        productIds: [SEED_PRODUCT_IDS.scratchPostOutOfStock]
    }),
    /*
     * customer — two saved products. `dogFoodStandard` is also in no cart of theirs, so moving
     * it to the cart is a state change a demo can actually show happening.
     */
    makeWishlist({
        id: '65de64f2a3c1d05b7e8f2103',
        userId: SEED_USER_ID,
        productIds: [SEED_PRODUCT_IDS.dogFoodStandard, SEED_PRODUCT_IDS.dogBedPremium]
    })
];

/** Seed this collection. Declared in `./index`; called by `scenarios/apply.ts`. */
export const seedWishlistsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(wishlistFixtures.map((wishlist) => upsertByOwner(wishlistRepository, wishlist)));

/** Read the seeded wishlists back as stored, sorted by owner — see `./products`. */
export const exportSeededWishlists = async (): Promise<Record<string, unknown[]>> => ({
    wishlists: await exportCollection(wishlistModel, { userId: 1 })
});
