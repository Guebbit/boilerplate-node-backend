/**
 * This module's slice of the demo dataset, in mongoose shape.
 * See `modules/users/seeds.ts` for where the underlying facts live and why they stay there.
 */

import { Types } from 'mongoose';
import { seedOrders, seedProducts } from '@seed-identities';
import { upsertById, type TSeedOutcome } from '@infrastructure/persistence/seed';
import { orderRepository } from './repository';
import type { IOrderDocument } from './model';

/*
 * An order item embeds a snapshot of the product as it was when the order was placed.
 *
 * Built from `seedProducts` rather than from the products module's own fixtures, even though every
 * snapshot in this dataset is currently an exact copy of the live product. Reaching into a sibling
 * for seed data would make this module's demo rows undeleteable independently of that module's,
 * and the two mappings agreeing is what `seed-identities.ts` already guarantees.
 *
 * The lookup throws deliberately: an order referencing a product id that is not in `seedProducts`
 * is a corrupt fixture, and a seeder that silently wrote an order with a missing product would be
 * worse than one that refuses to start.
 *
 * A snapshot deliberately carries NO `deletedAt`. The catalogue row's soft-delete says the product
 * is no longer for sale; it says nothing about an order already placed, and copying it in would
 * make a historical line item look retracted. No fixture exercises the difference today — no seed
 * order references the one soft-deleted product — so this is a rule being stated, not a dataset
 * being changed.
 */
const snapshotOf = (productId: string) => {
    const product = seedProducts.find((candidate) => candidate.id === productId);
    if (!product)
        throw new Error(
            `seed fixtures: order references product ${productId}, which is not in seedProducts`
        );

    return {
        _id: new Types.ObjectId(product.id),
        title: product.title,
        price: product.price,
        imageUrl: product.imageUrl,
        active: product.active,
        description: product.description
    };
};

export const orderFixtures = seedOrders.map((order) => ({
    _id: new Types.ObjectId(order.id),
    userId: new Types.ObjectId(order.userId),
    email: order.email,
    items: order.items.map((item) => ({
        product: snapshotOf(item.productId),
        quantity: item.quantity
    })),
    ...(order.deletedAt ? { deletedAt: new Date(order.deletedAt) } : {})
}));

/** Seed this module's collection. Declared in `module.ts`; called by `db/seeds/index.ts`. */
export const seedOrdersCollection = (): Promise<TSeedOutcome[]> =>
    Promise.all(
        orderFixtures.map((order) =>
            upsertById(orderRepository, order as Partial<IOrderDocument> & { _id: Types.ObjectId })
        )
    );
