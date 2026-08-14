/**
 * This module's slice of the demo dataset, in mongoose shape.
 * See `modules/users/seeds.ts` for where the underlying facts live and why they stay there.
 *
 * Carts are the one collection here with no fixed `_id` to key on, so they do not go through
 * `upsertById`: `carts.userId` is unique, a cart is addressed by whose it is, and no cart id ever
 * reaches the wire — which is why `seed-identities.ts` gives a cart no id to pin.
 */

import { Types } from 'mongoose';
import { seedUsers } from '@seed-identities';
import type { SeedOutcome } from '@infrastructure/persistence/seed';
import { cartRepository } from './repository';
import type { CartDocument } from './model';

/*
 * Only users with something in their cart get a document: absence and an empty cart are the same
 * state, and the first write upserts one into existence.
 */
export const cartFixtures = seedUsers
    .filter((user) => user.cart.length > 0)
    .map((user) => ({
        userId: new Types.ObjectId(user.id),
        items: user.cart.map((item) => ({
            productId: new Types.ObjectId(item.productId),
            quantity: item.quantity
        }))
    }));

/** Upsert one cart fixture by its OWNER rather than by id. */
const upsertByOwner = async (fixture: (typeof cartFixtures)[number]): Promise<SeedOutcome> => {
    const existing = await cartRepository.findByUserId(fixture.userId.toString());
    if (existing) return 'skipped';
    await cartRepository.create(fixture as Partial<CartDocument>);
    return 'created';
};

/** Seed this module's collection. Declared in `module.ts`; called by `db/seeds/index.ts`. */
export const seedCartsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(cartFixtures.map((cart) => upsertByOwner(cart)));
