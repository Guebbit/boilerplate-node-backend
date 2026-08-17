/**
 * The order book's slice of the demo dataset.
 *
 * Every snapshot here is currently an exact copy of the live catalogue row, so they are built by
 * LOOKUP rather than restated — `seedProductById` comes through `@modules/products/seeds`, the
 * demo path this module's `conformist` edge already entitles it to. If a fixture ever needs an
 * order whose snapshot deliberately differs from today's product, to exercise the "price changed
 * since" case, it has to state that snapshot explicitly: deriving it would silently erase the
 * difference.
 *
 * The lookup throws rather than skipping. An order referencing a product that is not in the
 * catalogue is a corrupt fixture, and a seeder that quietly wrote an order with a missing product
 * would be worse than one that refuses to start. That check lives in `products` now, next to the
 * catalogue it validates, rather than being restated by every module that reads a fixture.
 *
 * The email is a SNAPSHOT too, which is why this module reads the demo addresses from
 * `@kernel/seed-accounts` and not from a user record: an order remembers where it was sent, and
 * `orders` has no registry edge on `users` precisely because it never needs the live account.
 */

import {
    SEED_ADMIN_EMAIL,
    SEED_ADMIN_ID,
    SEED_USER_EMAIL,
    SEED_USER_ID
} from '@kernel/seed-accounts';
import { SEED_PRODUCT_IDS, seedProductById } from '@modules/products/seeds';
import { makeOrder, type OrderSnapshotInput } from './factory';
import { orderModel } from './model';
import { upsertById, type SeedOutcome } from '@infrastructure/persistence/seed';
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

const line = (productId: string, quantity: number) => ({
    product: snapshotOf(productId),
    quantity
});

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
    /*
     * The SHIPPED order — the only fixture that carries the three shipping columns, and the reason
     * it exists is that they were added to the schema long after these fixtures were written. Every
     * seeded order was a pickup-shaped order with no address, so nothing in the demo dataset showed
     * what an order that chose a method looks like, and `totalPrice` never once included a shipping
     * cost.
     *
     * `standard` is priced 5 with `freeAbove: 100` (see `delivery/domain/rates`), and these lines
     * total 1,540 — so the cost frozen here is 0, not 5. That is the interesting number: it is what
     * `priceShipping` decided at checkout, and an order keeps the price it was charged rather than
     * the method's rate card, which can change.
     *
     * The address restates `account/seeds.ts`'s default entry rather than importing it: this module
     * declares no edge on `account`, and a snapshot that COULD NOT differ from the live book would
     * be demonstrating the opposite of the thing it is here to demonstrate.
     */
    makeOrder({
        id: '661c795a9e22bcbef63a5832',
        userId: SEED_ADMIN_ID,
        email: SEED_ADMIN_EMAIL,
        items: [line(SEED_PRODUCT_IDS.pufettino, 20)],
        shippingMethod: 'standard',
        shippingCost: 0,
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
        /* Earlier in the day than the `createdAt` this order's id encodes, i.e. deleted before it
         * was placed. Left that way on purpose: the fixtures do not promise their three dates
         * agree, and nothing reads them together — the soft-delete branches test for the field's
         * PRESENCE. See `@infrastructure/persistence/factory` for why chasing that consistency
         * costs more than it buys. */
        deletedAt: '2024-08-07T09:12:03.114Z'
    })
];

/*
 * ── Why no seeded reservation ────────────────────────────────────────────────────────────────
 *
 * A `pending` order placed through the shop holds its units, so it is tempting to open a matching
 * hold here. Two things say not to.
 *
 * The seeder runs every module CONCURRENTLY, and the invariant that makes that safe is stated in
 * `db/seeds/index.ts`: no fixture is derived from another fixture's write. Reserving would break
 * it — `reserveForOrder` conditionally writes the PRODUCT document that `products/seeds.ts` is
 * writing at the same moment, so whether the hold succeeded would depend on who won. It won
 * every time it was measured, which is the worst version of that bug rather than a defence.
 *
 * And it would be inventing a state the application cannot reach by this path. These fixtures are
 * written straight to the collection; none of them went through a checkout, so none of them ever
 * held anything. Every seeded product's `reserved` is 0 because that is the truth about a database
 * nobody has shopped in yet. A hold appears the moment someone checks out, which is also the only
 * way one is ever created in production.
 */

/** Seed this module's collection. Declared in `module.ts`; called by `db/seeds/index.ts`. */
export const seedOrdersCollection = (): Promise<SeedOutcome[]> =>
    Promise.all(orderFixtures.map((order) => upsertById(orderRepository, order)));

/**
 * Read the seeded orders back as the API serves them — see `../products/seeds`.
 *
 * `totalItems`, `totalQuantity` and `totalPrice` appear here without being stored anywhere:
 * `applyOrderTransform` derives them during serialization. Publishing the serialized row is what
 * lets the paired frontend stop recomputing that arithmetic in `mockOrderMath` and hope it agrees.
 */
export const exportSeededOrders = async (): Promise<Record<string, unknown[]>> => ({
    orders: await orderModel
        .find()
        .sort({ _id: 1 })
        .exec()
        .then((documents) => documents.map((document_) => document_.toJSON()))
});
