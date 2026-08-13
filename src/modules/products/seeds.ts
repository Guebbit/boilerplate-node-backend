/**
 * This module's slice of the demo dataset, in mongoose shape.
 * See `modules/users/seeds.ts` for where the underlying facts live and why they stay there.
 */

import { Types } from 'mongoose';
import { seedProducts } from '@seed-identities';
import { upsertById, type TSeedOutcome } from '@infrastructure/persistence/seed';
import { productRepository } from './repository';

export const productFixtures = seedProducts.map((product) => ({
    _id: new Types.ObjectId(product.id),
    title: product.title,
    price: product.price,
    stock: product.stock,
    categories: product.categories,
    tags: product.tags,
    imageUrl: product.imageUrl,
    active: product.active,
    description: product.description,
    ...(product.deletedAt ? { deletedAt: new Date(product.deletedAt) } : {})
}));

/** Seed this module's collection. Declared in `module.ts`; called by `db/seeds/index.ts`. */
export const seedProductsCollection = (): Promise<TSeedOutcome[]> =>
    Promise.all(productFixtures.map((product) => upsertById(productRepository, product)));
