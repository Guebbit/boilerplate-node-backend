/**
 * @module
 * Schema contract — the declarations themselves (defaults, `required`, `select: false`), not the
 * transforms the sibling specs in this folder cover. Runs against real Mongo, since these are
 * Mongoose's behaviours rather than ours: a mocked model would assert the mock's own opinion of
 * what `default` means.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { productRepository } from '@modules/products';
import { createProduct } from '@modules/products/tests/fixtures';

setupTestDb();

describe('product schema', () => {
    it('accepts a price of zero', async () => {
        // `required` on a Number rejects `undefined`, not `0`. A free product is legal, and a
        // truthiness-based guard would wrongly reject it.
        const product = await productRepository.create({ title: 'Free', price: 0 } as never);

        expect(product.price).toBe(0);
    });

    it('serialises to id, never _id or __v', async () => {
        const product = await createProduct({ title: 'Serialised' });

        const serialized = product.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(product._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });
});
