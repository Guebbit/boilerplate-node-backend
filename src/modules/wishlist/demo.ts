/**
 * The wishlist's slice of the demo dataset.
 *
 * Only PUBLICLY VISIBLE products are saved, and the named ids are what makes that checkable rather
 * than merely asserted: a line pointing at `carinoSoftDeleted` or `bundleInactive` would render as
 * a hole in the storefront's wishlist page — the row resolves to a product the scoping rules then
 * refuse to return.
 */

import { SEED_ADMIN_ID, SEED_USER_ID } from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS } from '@modules/products/demo';
import { makeWishlist } from './factory';
import { wishlistModel } from './model';
import { SEED_SAVE_OPTIONS, type SeedOutcome } from '@infrastructure/persistence/seed';
import { wishlistRepository } from './repository';

export const wishlistFixtures = [
    /* root — one saved product, enough for the admin account to show a non-empty page. */
    makeWishlist({
        id: '65dd2cb27c5e8a1f3b9d4602',
        userId: SEED_ADMIN_ID,
        productIds: [SEED_PRODUCT_IDS.micionaOutOfStock]
    }),
    /*
     * ginopinoshow — two saved products. `panino` is also in no cart of theirs, so moving it to the
     * cart is a state change a demo can actually show happening.
     */
    makeWishlist({
        id: '65de64f2a3c1d05b7e8f2103',
        userId: SEED_USER_ID,
        productIds: [SEED_PRODUCT_IDS.panino, SEED_PRODUCT_IDS.pufettino]
    })
];

/** Upsert one wishlist fixture by its OWNER rather than by id — see `../cart/demo`. */
const upsertByOwner = async (fixture: (typeof wishlistFixtures)[number]): Promise<SeedOutcome> => {
    const existing = await wishlistRepository.findByUserId(fixture.userId.toString());
    if (existing) return 'skipped';
    await wishlistRepository.create(fixture, SEED_SAVE_OPTIONS);
    return 'created';
};

/** Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`. */
export const seedWishlistsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(wishlistFixtures.map((wishlist) => upsertByOwner(wishlist)));

/** Read the seeded wishlists back as stored, sorted by owner — see `../cart/demo`. */
export const exportSeededWishlists = async (): Promise<Record<string, unknown[]>> => ({
    wishlists: await wishlistModel
        .find()
        .sort({ userId: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()))
});
