/**
 * @module
 * The cart's slice of the demo dataset, stated here where the collection is owned rather than
 * nested under each seeded person. Only users with something in their cart get a document —
 * absence and an empty cart are the same state, so most demo customers have no row at all, which
 * is itself the fixture for a person who has never added anything.
 */

import { SEED_OWNER_ID } from '@kernel/seed-accounts';
import { fillerProductId } from './products';
import { SEED_PRODUCT_IDS } from './subjects';
import { SEED_CUSTOMER_IDS } from './users';
import { makeCart } from '@modules/cart/factories';
import { type SeedOutcome, upsertByOwner } from '@infrastructure/persistence/seed';
import { cartRepository } from '@modules/cart/repository';

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
 * The seeded carts. `SEED_OWNER_ID` keeps its original two-line basket, stated directly since it
 * draws on the named catalogue rather than the filler one; {@link FILLER_CARTS} supplies the rest.
 * The other seven demo shoppers, and the `customer` account, have no cart row at all — see this
 * module's own docblock for why that IS their fixture.
 *
 * No pinned `_id`, unlike every other fixture file: {@link upsertByOwner} keys on `userId`, so an
 * id buys no idempotency here, and nothing outside this file names one. Letting Mongo mint it also
 * dates the row NOW — which this collection needs, since `carts_updatedAt_ttl` reaps a cart older
 * than `NODE_CART_RETENTION_DAYS`, and a date decoded from a hand-written id ages past it.
 */
export const cartFixtures = [
    makeCart({
        userId: SEED_OWNER_ID,
        items: [
            { productId: SEED_PRODUCT_IDS.dogFoodStandard, quantity: 2 },
            { productId: SEED_PRODUCT_IDS.dogBedPremium, quantity: 3 }
        ]
    }),
    ...FILLER_CARTS.map(([customer, productIndexA, quantityA, productIndexB, quantityB]) =>
        makeCart({
            userId: SEED_CUSTOMER_IDS[customer],
            items: [
                { productId: fillerProductId(productIndexA), quantity: quantityA },
                { productId: fillerProductId(productIndexB), quantity: quantityB }
            ]
        })
    )
];

/** Seed this collection. Declared in `./index`; called by `scenarios/apply.ts`. */
export const seedCartsCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(cartFixtures.map((cart) => upsertByOwner(cartRepository, cart)));
