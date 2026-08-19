/**
 * The cart's slice of the demo dataset.
 *
 * These rows used to live inside the users fixture — a `cart` array hanging off each seeded person,
 * which this module read back out and reshaped. That put one module's records inside another's, for
 * no reason beyond both halves needing to sit in a single shared file. They are stated here now,
 * where the collection is owned.
 *
 * Only users with something in their cart get a document: absence and an empty cart are the same
 * state, and the first write upserts one into existence. So the ordinary customer has no row at all
 * — which is itself the fixture for "a person who has never added anything", the state every fresh
 * signup is in.
 */

import { SEED_ADMIN_ID } from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS } from '@modules/products/demo';
import { makeCart } from './factory';
import { cartModel } from './model';
import { SEED_SAVE_OPTIONS, type SeedOutcome } from '@infrastructure/persistence/seed';
import { cartRepository } from './repository';

export const cartFixtures = [
    makeCart({
        id: '65dd2c9e1b4a7f3c0d2e5a01',
        userId: SEED_ADMIN_ID,
        items: [
            { productId: SEED_PRODUCT_IDS.panino, quantity: 2 },
            { productId: SEED_PRODUCT_IDS.pufettino, quantity: 3 }
        ]
    })
];

/**
 * Upsert one cart fixture by its OWNER rather than by id.
 *
 * `upsertById` cannot serve here — there is no pinned `_id` to key on — so this module states the
 * same skip-if-present policy against the field that does identify a cart.
 */
const upsertByOwner = async (fixture: (typeof cartFixtures)[number]): Promise<SeedOutcome> => {
    const existing = await cartRepository.findByUserId(fixture.userId.toString());
    if (existing) return 'skipped';
    await cartRepository.create(fixture, SEED_SAVE_OPTIONS);
    return 'created';
};

/** Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`. */
export const seedCartsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(cartFixtures.map((cart) => upsertByOwner(cart)));

/**
 * Read the seeded carts back as stored — see `../products/demo`.
 *
 * Sorted by owner, because a cart has no pinned `_id` to sort by. The shape published here is the
 * STORED one, not a `CartResponse`: no endpoint serves a raw cart, `./service` builds the response
 * by pricing the lines, and the frontend's handler mirrors that same construction.
 */
export const exportSeededCarts = async (): Promise<Record<string, unknown[]>> => ({
    carts: await cartModel
        .find()
        .sort({ userId: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()))
});
