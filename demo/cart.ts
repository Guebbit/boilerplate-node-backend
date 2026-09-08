/**
 * @module
 * The cart's slice of the demo dataset, stated here where the collection is owned rather than
 * nested under each seeded person. Only users with something in their cart get a document —
 * absence and an empty cart are the same state, so most demo customers have no row at all, which
 * is itself the fixture for a person who has never added anything.
 */

import { SEED_ADMIN_ID } from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS, fillerProductId } from './products';
import { SEED_CUSTOMER_IDS } from './users';
import { makeCart } from '@modules/cart/fixtures';
import { cartModel } from '@modules/cart/model';
import {
    type SeedOutcome,
    exportCollection,
    upsertByOwner
} from '@infrastructure/persistence/seed';
import { cartRepository } from '@modules/cart/repository';

/**
 * Deterministic id for demo cart `index` — see `./users`'s `demoCustomerId` for why this isn't
 * `new Types.ObjectId()`. Its own prefix keeps this id space apart from every other.
 */
const demoCartId = (index: number): string => `67f0c3${index.toString(16).padStart(18, '0')}`;

/**
 * The three "medium" customers' carts, as `[customer, productIndexA, quantityA, productIndexB,
 * quantityB]` — each a two-line basket drawn from the combinatorial catalogue, differing from one
 * another only in who and what.
 */
const FILLER_CARTS: [
    customer: keyof typeof SEED_CUSTOMER_IDS,
    productIndexA: number,
    quantityA: number,
    productIndexB: number,
    quantityB: number
][] = [
    ['marcus', 10, 2, 34, 1],
    ['harper', 58, 1, 82, 3],
    ['isla', 20, 2, 106, 1]
];

/**
 * The seeded carts. `SEED_ADMIN_ID` keeps its original two-line basket, stated directly since it
 * draws on the named catalogue rather than the filler one; {@link FILLER_CARTS} supplies the rest.
 * The other seven demo shoppers, and the `customer` account, have no cart row at all — see this
 * module's own docblock for why that IS their fixture.
 */
export const cartFixtures = [
    makeCart({
        id: '65dd2c9e1b4a7f3c0d2e5a01',
        userId: SEED_ADMIN_ID,
        items: [
            { productId: SEED_PRODUCT_IDS.dogFoodStandard, quantity: 2 },
            { productId: SEED_PRODUCT_IDS.dogBedPremium, quantity: 3 }
        ]
    }),
    ...FILLER_CARTS.map(([customer, productIndexA, quantityA, productIndexB, quantityB], index) =>
        makeCart({
            id: demoCartId(index),
            userId: SEED_CUSTOMER_IDS[customer],
            items: [
                { productId: fillerProductId(productIndexA), quantity: quantityA },
                { productId: fillerProductId(productIndexB), quantity: quantityB }
            ]
        })
    )
];

/** Seed this collection. Declared in `./index`; called by `db/demo/index.ts`. */
export const seedCartsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(cartFixtures.map((cart) => upsertByOwner(cartRepository, cart)));

/**
 * Read the seeded carts back as stored — see `./products`.
 *
 * Sorted by owner, because a cart has no pinned `_id` to sort by. The shape published here is the
 * STORED one, not a `CartResponse`: no endpoint serves a raw cart, `@modules/cart/service` builds
 * the response by pricing the lines, and the frontend's handler mirrors that same construction.
 */
export const exportSeededCarts = async (): Promise<Record<string, unknown[]>> => ({
    carts: await exportCollection(cartModel, { userId: 1 })
});
