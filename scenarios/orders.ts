/**
 * @module
 * The order book's slice of the demo dataset. Every snapshot is an exact copy of the live
 * catalogue row, built by LOOKUP (`seedProductById`) rather than restated, so a fixture that
 * needs to differ from today's product must say so explicitly; the lookup throws rather than
 * skipping a missing product. The email is a SNAPSHOT too, from `@scenarios/accounts` — no
 * import here reads a live user record.
 */

import {
    SEED_OWNER_EMAIL,
    SEED_OWNER_ID,
    SEED_USER_EMAIL,
    SEED_USER_ID
} from '@scenarios/accounts';
import { fillerProductId, seedProductById } from './products';
import { SEED_ORDER_IDS, SEED_PRODUCT_IDS } from './subjects';
import { SEED_CUSTOMER_EMAILS, SEED_CUSTOMER_IDS } from './users';
import { makeOrder, type OrderSnapshotInput } from '@modules/orders/factories';
import { insertIfAbsent, type SeedOutcome } from '@scenarios/seed';
import { orderRepository } from '@modules/orders/repository';
import { inventoryService } from '@modules/inventory';
import { OrderStatus } from '@types';

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
        thumbnailUrl: product.thumbnailUrl,
        categories: product.categories,
        tags: product.tags,
        active: product.active,
        // Left to the schema's own `default: true` on every fixture, so the plain fixture
        // object never carries a value for it — a real checkout freezes what the PERSISTED
        // product actually has, which this restates rather than passing through as `undefined`.
        requiresShipping: product.requiresShipping ?? true,
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
 * Deterministic id for a seed history order at `index` — see `./users`'s `seedCustomerId` for why
 * this isn't `new Types.ObjectId()`. Its own prefix keeps this id space apart from every other
 * collection's.
 *
 * The prefix is fixed and the index moves only the id's LOW bytes, so `identityOf`'s
 * id-derived `createdAt` (`objectId.getTimestamp()`, which reads the ObjectId's own high-byte
 * timestamp) would be IDENTICAL for all sixteen orders this builds if `createdAt` were left
 * unstated. `seedOrderDate` below states it explicitly instead, spreading these across 2024 the
 * same way the named orders' own real-ObjectId-shaped ids already do.
 */
const seedOrderId = (index: number): string => `67f0c4${index.toString(16).padStart(18, '0')}`;

/** One of these sixteen orders' `createdAt` — 20 days apart, starting 2024-01-01. */
const seedOrderDate = (index: number): Date =>
    new Date(Date.UTC(2024, 0, 1) + index * 20 * 24 * 60 * 60 * 1000);

/** The four test-critical orders — see the comment on each for the branch it exercises. */
const namedOrders = [
    /* `delivered`, not `pending`: a real pending order holds stock and gets swept after 30
     * minutes (`inventory/service.ts`), so a history order sitting in `pending` forever is a
     * state the app itself can never reach. `order.ownerPending` below is the one order that
     * gets to be `pending`, because it earns it with a real hold. */
    makeOrder({
        id: SEED_ORDER_IDS.ownerFirst,
        userId: SEED_OWNER_ID,
        status: OrderStatus.delivered,
        /* Not the owner's current address. This order predates an email change and keeps the old
         * one, so "the order remembers where it was sent" is a property the dataset demonstrates
         * rather than a sentence in a comment. */
        email: 'oldpsw@root.it',
        items: [line(SEED_PRODUCT_IDS.dogFoodStandard, 1)]
    }),
    /* The only fixture with shipping columns — added because the fixtures predate those columns
     * and none demonstrated a chosen delivery method. `shipped` matches the id's own name. */
    makeOrder({
        id: SEED_ORDER_IDS.ownerShipped,
        userId: SEED_OWNER_ID,
        email: SEED_OWNER_EMAIL,
        status: OrderStatus.shipped,
        items: [line(SEED_PRODUCT_IDS.dogBedPremium, 20)],
        /* `standard` costs 5, waived above `freeAbove` (`delivery/domain/rates`) — these lines
         * clear that threshold, so 0, not 5, is what `priceShipping` decided at checkout. An
         * order keeps the price it was charged, not the method's current rate card. */
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
     * anchors the `customer` account's "large" history below: this is the FIFTH order, not the
     * first. `cancelled`, not `pending`: the same unreachable-state reasoning as `ownerFirst`.
     */
    makeOrder({
        id: SEED_ORDER_IDS.userDeleted,
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        status: OrderStatus.cancelled,
        items: [line(SEED_PRODUCT_IDS.dogFoodStandard, 4)],
        /* Earlier than the `createdAt` this order's id encodes, i.e. deleted before it was
         * placed — left that way on purpose. The factories don't promise their three dates agree;
         * nothing reads them together, only the field's PRESENCE. See
         * `@infrastructure/persistence/factories`. */
        deletedAt: '2024-08-07T09:12:03.114Z'
    }),
    /*
     * `order.ownerPending`'s subject — the one order the seed leaves genuinely `pending`, because
     * it is the one order the seed gives a real hold to (see `seedOwnerPendingOrder` below).
     * Every other order in this file is a snapshot the app never held stock for; this is the one
     * this file cannot make that claim about, on purpose.
     */
    makeOrder({
        id: SEED_ORDER_IDS.ownerPending,
        userId: SEED_OWNER_ID,
        email: SEED_OWNER_EMAIL,
        items: [line(SEED_PRODUCT_IDS.dogFoodStandard, 2)]
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
        id: seedOrderId(0),
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        status: OrderStatus.delivered,
        createdAt: seedOrderDate(0),
        items: [
            line(SEED_PRODUCT_IDS.dogFoodStandard, 3),
            line(SEED_PRODUCT_IDS.dogBedPremium, 2),
            line(fillerProductId(25), 4),
            line(fillerProductId(77), 1)
        ]
    }),
    makeOrder({
        id: seedOrderId(1),
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        status: OrderStatus.delivered,
        createdAt: seedOrderDate(1),
        items: [
            line(fillerProductId(9), 5),
            line(fillerProductId(48), 2),
            line(fillerProductId(101), 3)
        ]
    }),
    makeOrder({
        id: seedOrderId(2),
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        status: OrderStatus.delivered,
        createdAt: seedOrderDate(2),
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
        id: seedOrderId(3 + index),
        userId: SEED_CUSTOMER_IDS[customer],
        email: SEED_CUSTOMER_EMAILS[customer],
        status: OrderStatus.delivered,
        createdAt: seedOrderDate(3 + index),
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
        id: seedOrderId(10 + index),
        userId: SEED_CUSTOMER_IDS[customer],
        email: SEED_CUSTOMER_EMAILS[customer],
        status: OrderStatus.delivered,
        createdAt: seedOrderDate(10 + index),
        items: lines.map(([productIndex, quantity]) =>
            line(fillerProductId(productIndex), quantity)
        )
    })
);

/** Every demo order, in id order. */
export const orderFixtures = [
    ...namedOrders,
    ...customerOrders,
    ...smallCustomerOrders,
    ...mediumCustomerOrders
];

/*
 * No seeded reservation on any of the orders above: `scenarios/apply.ts` runs every module
 * CONCURRENTLY, and `reserveForOrder` would conditionally write the same PRODUCT document
 * `./products` is writing at that moment — a race it loses every time. It would also invent a
 * state this path never reaches: these rows are written straight to the collection, none went
 * through checkout, so every seeded product's `reserved` is honestly 0 for them.
 *
 * `order.ownerPending` is the one exception — see `seedOwnerPendingOrder` below, which runs
 * strictly after `./products` has finished, once `seedShop` has resolved the same race for it.
 */

/** Seed this collection. Declared in `./index`'s `shopModules`; walked by `seedShop`. */
export const seedOrdersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(orderFixtures.map((order) => insertIfAbsent(orderRepository, order)));

/**
 * Give `order.ownerPending` its real hold, through the real `inventoryService.reserveForOrder` —
 * not written by hand — so the row is exactly what an abandoned checkout leaves behind: an order
 * document plus a reservation plus a `reserve` stock-movement row, all through the one code path
 * that ever writes any of them. Idempotent the same way `reserveForOrder` always is: a rerun
 * finds the hold already there and returns without moving a counter twice.
 *
 * Called by `seedShop`, never by `seedOrdersCollection` — it needs `./products`'s row to already
 * exist, which `orderFixtures`'s own concurrent write cannot promise.
 */
export const seedOwnerPendingOrder = (): Promise<void> =>
    inventoryService
        .reserveForOrder(SEED_ORDER_IDS.ownerPending, [
            { productId: SEED_PRODUCT_IDS.dogFoodStandard, quantity: 2 }
        ])
        .then((outcome) => {
            if (!outcome.held)
                throw new Error(
                    `seedOwnerPendingOrder: could not hold stock for ${SEED_ORDER_IDS.ownerPending} — ${JSON.stringify(outcome.shortfalls)}`
                );
        });
