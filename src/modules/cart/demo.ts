/**
 * @module
 * The cart's slice of the demo dataset, stated here where the collection is owned rather than
 * nested under each seeded person. Only users with something in their cart get a document —
 * absence and an empty cart are the same state, so most demo customers have no row at all, which
 * is itself the fixture for a person who has never added anything.
 */

import { SEED_ADMIN_ID } from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS, fillerProductId } from '@modules/products/demo';
import { SEED_CUSTOMER_IDS } from '@modules/users/demo';
import { makeCart } from './fixtures';
import { cartModel } from './model';
import {
    type SeedOutcome,
    exportCollection,
    upsertByOwner
} from '@infrastructure/persistence/seed';
import { cartRepository } from './repository';

/**
 * Deterministic id for demo cart `index` — see `@modules/users/demo`'s `demoCustomerId` for why
 * this isn't `new Types.ObjectId()`. Its own prefix keeps this id space apart from every other.
 */
const demoCartId = (index: number): string => `67f0c3${index.toString(16).padStart(18, '0')}`;

/**
 * The seeded carts. `SEED_ADMIN_ID` keeps its original two-line basket; the three "medium"
 * customers (`marcus`, `harper`, `isla` — see `@modules/users/demo`) each get a two-line basket
 * of their own, drawn from the combinatorial catalogue so a cart page has more than the same two
 * named products to show. The other seven demo customers, and `ginopinoshow`, have no cart row at
 * all — see this module's own docblock for why that IS their fixture.
 */
export const cartFixtures = [
    makeCart({
        id: '65dd2c9e1b4a7f3c0d2e5a01',
        userId: SEED_ADMIN_ID,
        items: [
            { productId: SEED_PRODUCT_IDS.panino, quantity: 2 },
            { productId: SEED_PRODUCT_IDS.pufettino, quantity: 3 }
        ]
    }),
    makeCart({
        id: demoCartId(0),
        userId: SEED_CUSTOMER_IDS.marcus,
        items: [
            { productId: fillerProductId(10), quantity: 2 },
            { productId: fillerProductId(34), quantity: 1 }
        ]
    }),
    makeCart({
        id: demoCartId(1),
        userId: SEED_CUSTOMER_IDS.harper,
        items: [
            { productId: fillerProductId(58), quantity: 1 },
            { productId: fillerProductId(82), quantity: 3 }
        ]
    }),
    makeCart({
        id: demoCartId(2),
        userId: SEED_CUSTOMER_IDS.isla,
        items: [
            { productId: fillerProductId(20), quantity: 2 },
            { productId: fillerProductId(106), quantity: 1 }
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
