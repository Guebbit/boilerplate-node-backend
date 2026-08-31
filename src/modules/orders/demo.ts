/**
 * @module
 * The order book's slice of the demo dataset. Every snapshot is an exact copy of the live
 * catalogue row, built by LOOKUP (`seedProductById`) rather than restated, so a fixture that
 * needs to differ from today's product must say so explicitly; the lookup throws rather than
 * skipping a missing product. The email is a SNAPSHOT too, from `@kernel/seed-accounts` —
 * `orders` has no registry edge on `users`.
 */

import {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_ID,
    SEED_USER_EMAIL,
    SEED_USER_ID
} from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS, seedProductById } from '@modules/products/demo';
import { makeOrder, type OrderSnapshotInput } from './fixtures';
import { orderModel } from './model';
import { upsertById, type SeedOutcome, exportCollection } from '@infrastructure/persistence/seed';
import { orderRepository } from './repository';

/** The catalogue row as it stands, reshaped into the snapshot an order item stores. */
const snapshotOf = (productId: string): OrderSnapshotInput => {
    /* Throws on a product that is not in the demo catalogue — `products` owns that check, because
     * it owns the catalogue. What this module owns is the RESHAPING below: `OrderSnapshotInput` is
     * an order's idea of a product, and only the order book gets to say what it holds. */
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

/** The seeded orders, each demonstrating a distinct case — see the comments on each fixture. */
export const orderFixtures = [
    makeOrder({
        id: '65de73a69ca05739be2b5e85',
        userId: SEED_ADMIN_ID,
        /* Not the admin's current address. This order predates an email change and keeps the old
         * one, so "the order remembers where it was sent" is a property the dataset demonstrates
         * rather than a sentence in a comment. */
        email: 'oldpsw@root.it',
        items: [line(SEED_PRODUCT_IDS.panino, 1), line(SEED_PRODUCT_IDS.micionaOutOfStock, 10)]
    }),
    /* The only fixture with shipping columns — added because the fixtures predate those columns
     * and none demonstrated a chosen delivery method. */
    makeOrder({
        id: '661c795a9e22bcbef63a5832',
        userId: SEED_ADMIN_ID,
        email: SEED_ADMIN_EMAIL,
        items: [line(SEED_PRODUCT_IDS.pufettino, 20)],
        /* `standard` costs 5 with `freeAbove: 100` (see `delivery/domain/rates`), and these lines
         * total 1,540 — so 0, not 5, is what `priceShipping` decided at checkout. An order keeps
         * the price it was charged, not the method's current rate card. */
        shippingMethod: 'standard',
        shippingCost: 0,
        /* Restates `account/demo.ts`'s default address rather than importing it — this module
         * declares no edge on `account`. */
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
     * scoping would wrongly allow, and which an admin-owned fixture could never catch.
     */
    makeOrder({
        id: '66b3f0c14d2e8a91c7d4a015',
        userId: SEED_USER_ID,
        email: SEED_USER_EMAIL,
        items: [line(SEED_PRODUCT_IDS.panino, 4)],
        /* Earlier than the `createdAt` this order's id encodes, i.e. deleted before it was
         * placed — left that way on purpose. The fixtures don't promise their three dates agree;
         * nothing reads them together, only the field's PRESENCE. See
         * `@infrastructure/persistence/fixtures`. */
        deletedAt: '2024-08-07T09:12:03.114Z'
    })
];

/*
 * No seeded reservation: the seeder runs every module CONCURRENTLY (see `db/demo/index.ts`), and
 * `reserveForOrder` would conditionally write the same PRODUCT document `products/demo.ts` is
 * writing at that moment — a race it loses every time. It would also invent a state this path
 * never reaches: these fixtures are written straight to the collection, none went through
 * checkout, so every seeded product's `reserved` is honestly 0.
 */

/** Seed this module's collection. Declared in `module.ts`; called by `db/demo/index.ts`. */
export const seedOrdersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(orderFixtures.map((order) => upsertById(orderRepository, order)));

/**
 * Read the seeded orders back as the API serves them — see `../products/demo`.
 *
 * `totalItems`, `totalQuantity` and `totalPrice` appear here without being stored anywhere:
 * `applyOrderTransform` derives them during serialization. Publishing the serialized row is what
 * lets the paired frontend stop recomputing that arithmetic in `mockOrderMath` and hope it agrees.
 */
export const exportSeededOrders = async (): Promise<Record<string, unknown[]>> => ({
    orders: await exportCollection(orderModel, { _id: 1 })
});
