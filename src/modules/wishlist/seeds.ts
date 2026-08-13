/**
 * This module's slice of the demo dataset, in mongoose shape.
 * See `modules/users/seeds.ts` for where the underlying facts live and why they stay there.
 *
 * Like carts, wishlists carry no fixed `_id` to key on: `wishlists.userId` is unique, a wishlist
 * is addressed by whose it is, and no wishlist id ever reaches the wire — so the fixture upserts
 * by owner rather than through `upsertById`.
 */

import { Types } from 'mongoose';
import { seedWishlists } from '@seed-identities';
import type { TSeedOutcome } from '@infrastructure/persistence/seed';
import { wishlistRepository } from './repository';
import type { IWishlistDocument } from './model';

export const wishlistFixtures = seedWishlists.map((wishlist) => ({
    userId: new Types.ObjectId(wishlist.userId),
    items: wishlist.productIds.map((productId) => ({
        productId: new Types.ObjectId(productId)
    }))
}));

/** Upsert one wishlist fixture by its OWNER rather than by id. */
const upsertByOwner = async (fixture: (typeof wishlistFixtures)[number]): Promise<TSeedOutcome> => {
    const existing = await wishlistRepository.findByUserId(fixture.userId.toString());
    if (existing) return 'skipped';
    await wishlistRepository.create(fixture as Partial<IWishlistDocument>);
    return 'created';
};

/** Seed this module's collection. Declared in `module.ts`; called by `db/seeds/index.ts`. */
export const seedWishlistsCollection = (): Promise<TSeedOutcome[]> =>
    Promise.all(wishlistFixtures.map((wishlist) => upsertByOwner(wishlist)));
