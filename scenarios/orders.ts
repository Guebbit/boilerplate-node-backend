/**
 * @module
 * The order book's slice of the demo dataset. Every snapshot is an exact copy of the live
 * catalogue row, built by LOOKUP (`seedProductById`) rather than restated, so a fixture that
 * needs to differ from today's product must say so explicitly; the lookup throws rather than
 * skipping a missing product. The email is a SNAPSHOT too, from `@kernel/seed-accounts` — no
 * import here reads a live user record.
 */

import {
    SEED_OWNER_EMAIL,
    SEED_OWNER_ID,
    SEED_USER_EMAIL,
    SEED_USER_ID
} from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS, fillerProductId, seedProductById } from './products';
import { SEED_CUSTOMER_EMAILS, SEED_CUSTOMER_IDS } from './users';
import { makeOrder, type OrderSnapshotInput } from '@modules/orders/factories';
import { orderModel } from '@modules/orders/model';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';
import { orderRepository } from '@modules/orders/repository';

/** The catalogue row as it stands, reshaped into the snapshot an order item stores. */
const snapshotOf = (productId: string): OrderSnapshotInput => {
    /* Throws on a product that is not in the demo catalogue — `./products` owns that check,
     * because it owns the catalogue. What this file owns is the RESHAPING below:
     * `OrderSnapshotInput` is an order's idea of a product, and only the order book gets to say
     * what it holds. */
    const product = seedProductById(productId);

    return {
        id: productId,
        title: product.title,
        price: product.price,
        description: product.description,
        imageUrl: product.imageUrl,
        active: product.active,
        createdAt: product.createdAt,
        updatedAt: product.updatedAt
    };
};

/** One order line: a snapshot of the product plus how many were bought. */
const line = (productId: string, quantity: number) => ({
    product: snapshotOf(productId),
    quantity
});

/**
 * Deterministic id for a demo history order at `index` — see `./users`'s `demoCustomerId` for why
 * this isn't `new Types.ObjectId()`. Its own prefix keeps this id space apart from every other
 * collection's.
 */
const demoOrderId = (index: number): string => `67f0c4${index.toString(16).padStart(18, '0')}`;

/** The three test-critical orders — see the comment on each for the branch it exercises. */
const namedOrders = [
    makeOrder({
        id: '65de73a69ca05739be2b5e85',
        userId: SEED_OWNER_ID,
        /* Not the owner's current address. This order predates an email change and keeps the old
         * one, so "the order remembers where it was sent" is a property the dataset demonstrates
         * rather than a sentence in a comment. */
        email: 'oldpsw@root.it',
        items: [
            line(SEED_PRODUCT_IDS.dogFoodStandard, 1),
            line(SEED_PRODUCT_IDS.scratchPostOutOfStock, 10)
        ]
    }),
    /* The only fixture with shipping columns — added because the fixtures predate those columns
     * and none demonstrated a chosen delivery method. */
    makeOrder({
        id: '661c795a9e22bcbef63a5832',
        userId: SEED_OWNER_ID,
        email: SEED_OWNER_EMAIL,
        items: [line(SEED_PRODUCT_IDS.dogBedPremium, 20)],
        /* `standard` costs 5 with `freeAbove: 100` (see `delivery/domain/rates`), and these lines
         * total 1,540 — so 0, not 5, is what `priceShipping` decided at checkout. An order keeps
         * the price it was charged, not the method's current rate card. */
        shippingMethod: 'standard',
        shippingCost: 0,
        /* Restates `./account`'s default address rather than importing it — an order's address is
         * a snapshot, not a live reference. */
        shippingAddress: {
            fullName: 'Root Rootsson',
            street: 'Via del Boilerplate 1',
            city: 'Modena',
            zip: '41121',
            country: 'IT',
            phone: '+39 059 000001'
        }
    }),
    /*
     * The soft-deleted order, and it sits on the NON-ADMIN account on purpose. The case it
     * exercises is "the owner cannot see their own soft-deleted order" — which ownership-only
     * scoping would wrongly allow, and which an admin-owned fixture could never catch. It also
     * anchors the `customer` account's "large" history below: this is the FOURTH order, not the
     * first.
     */
    makeOrder({
        id: '66b3f0c14d2e8a91c7d4a015',
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        items: [line(SEED_PRODUCT_IDS.dogFoodStandard, 4)],
        /* Earlier than the `createdAt` this order's id encodes, i.e. deleted before it was
         * placed — left that way on purpose. The factories don't promise their three dates agree;
         * nothing reads them together, only the field's PRESENCE. See
         * `@infrastructure/persistence/factories`. */
        deletedAt: '2024-08-07T09:12:03.114Z'
    })
];

/**
 * The `customer` account's three ADDITIONAL orders (on top of the soft-deleted one above), each
 * larger than anything a "small" or "medium" shopper below carries — more lines, higher
 * quantities.
 * None has `shippingAddress`/`shippingMethod`: like the owner's first order, these predate a
 * chosen delivery method.
 */
const customerOrders = [
    makeOrder({
        id: demoOrderId(0),
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        items: [
            line(SEED_PRODUCT_IDS.dogFoodStandard, 3),
            line(SEED_PRODUCT_IDS.dogBedPremium, 2),
            line(fillerProductId(25), 4),
            line(fillerProductId(77), 1)
        ]
    }),
    makeOrder({
        id: demoOrderId(1),
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        items: [
            line(fillerProductId(9), 5),
            line(fillerProductId(48), 2),
            line(fillerProductId(101), 3)
        ]
    }),
    makeOrder({
        id: demoOrderId(2),
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        items: [
            line(fillerProductId(31), 2),
            line(fillerProductId(64), 6),
            line(fillerProductId(110), 1),
            line(fillerProductId(4), 2)
        ]
    })
];

/**
 * The seven "small" customers (`./users`'s `amelia` through `priya`) — one order
 * each, one line, a modest quantity. Each draws a different row from the combinatorial catalogue
 * so the seven don't all buy the same thing.
 */
const smallCustomerOrders = (
    [
        ['amelia', 3, 1],
        ['benjamin', 15, 1],
        ['chloe', 27, 2],
        ['daniel', 42, 1],
        ['grace', 58, 1],
        ['felix', 71, 1],
        ['priya', 89, 2]
    ] as [customer: keyof typeof SEED_CUSTOMER_IDS, productIndex: number, quantity: number][]
).map(([customer, productIndex, quantity], index) =>
    makeOrder({
        id: demoOrderId(3 + index),
        userId: SEED_CUSTOMER_IDS[customer],
        email: SEED_CUSTOMER_EMAILS[customer],
        items: [line(fillerProductId(productIndex), quantity)]
    })
);

/** One medium order: who placed it, and its lines as `[productIndex, quantity]` pairs. */
interface MediumOrderSeed {
    customer: keyof typeof SEED_CUSTOMER_IDS;
    lines: [productIndex: number, quantity: number][];
}

/**
 * The three "medium" shoppers (`marcus`, `harper`, `isla`) — two orders each, two or three lines
 * apiece, bigger than a "small" order but well short of the `customer` account's.
 */
const MEDIUM_ORDERS: MediumOrderSeed[] = [
    {
        customer: 'marcus',
        lines: [
            [5, 2],
            [46, 1]
        ]
    },
    {
        customer: 'marcus',
        lines: [
            [63, 1],
            [97, 3],
            [112, 1]
        ]
    },
    {
        customer: 'harper',
        lines: [
            [8, 2],
            [50, 2]
        ]
    },
    {
        customer: 'harper',
        lines: [
            [70, 1],
            [99, 1],
            [120, 2]
        ]
    },
    {
        customer: 'isla',
        lines: [
            [12, 1],
            [40, 3]
        ]
    },
    {
        customer: 'isla',
        lines: [
            [66, 2],
            [95, 1],
            [118, 2]
        ]
    }
];

/** The multi-line orders, ids from 10 up, each spending against the filler catalogue. */
const mediumCustomerOrders = MEDIUM_ORDERS.map(({ customer, lines }, index) =>
    makeOrder({
        id: demoOrderId(10 + index),
        userId: SEED_CUSTOMER_IDS[customer],
        email: SEED_CUSTOMER_EMAILS[customer],
        items: lines.map(([productIndex, quantity]) =>
            line(fillerProductId(productIndex), quantity)
        )
    })
);

/** Every demo order, in id order. The seeder and the exported dataset both read this. */
export const orderFixtures = [
    ...namedOrders,
    ...customerOrders,
    ...smallCustomerOrders,
    ...mediumCustomerOrders
];

/*
 * No seeded reservation: `scenarios/apply.ts` runs every module CONCURRENTLY, and
 * `reserveForOrder` would conditionally write the same PRODUCT document `./products` is
 * writing at that moment — a race it loses every time. It would also invent a state this path
 * never reaches: these rows are written straight to the collection, none went through
 * checkout, so every seeded product's `reserved` is honestly 0.
 */

/** Seed this collection. Declared in `./index`; called by `scenarios/apply.ts`. */
export const seedOrdersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(orderFixtures.map((order) => upsertById(orderRepository, order)));

/**
 * Read the seeded orders back as the API serves them — see `./products`.
 *
 * `totalItems`, `totalQuantity` and `totalPrice` appear here without being stored anywhere:
 * `applyOrderTransform` derives them during serialization. Publishing the serialized row is what
 * lets the paired frontend stop recomputing that arithmetic in `mockOrderMath` and hope it agrees.
 */
export const exportSeededOrders = async (): Promise<Record<string, unknown[]>> => ({
    orders: await exportCollection(orderModel, { _id: 1 })
});
