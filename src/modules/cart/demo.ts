/**
 * @module
 * The cart's slice of the demo dataset, stated here where the collection is owned rather than
 * nested under each seeded person. Only users with something in their cart get a document —
 * absence and an empty cart are the same state, so the ordinary customer has no row at all,
 * which is itself the fixture for a person who has never added anything.
 */

import { SEED_ADMIN_ID } from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS } from '@modules/products/demo';
import { makeCart } from './fixtures';
import { cartModel } from './model';
import {
    type SeedOutcome,
    exportCollection,
    upsertByOwner
} from '@infrastructure/persistence/seed';
import { cartRepository } from './repository';

/** The seeded carts: one per demo account with something in their basket. */
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

/** Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`. */
export const seedCartsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(cartFixtures.map((cart) => upsertByOwner(cartRepository, cart)));

/**
 * Read the seeded carts back as stored — see `../products/demo`.
 *
 * Sorted by owner, because a cart has no pinned `_id` to sort by. The shape published here is the
 * STORED one, not a `CartResponse`: no endpoint serves a raw cart, `./service` builds the response
 * by pricing the lines, and the frontend's handler mirrors that same construction.
 */
export const exportSeededCarts = async (): Promise<Record<string, unknown[]>> => ({
    carts: await exportCollection(cartModel, { userId: 1 })
});
