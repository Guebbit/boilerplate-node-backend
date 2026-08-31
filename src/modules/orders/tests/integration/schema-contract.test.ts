/**
 * @module
 * Schema contract — the declarations themselves, not the transforms. The sibling specs in this
 * folder cover behaviour; this covers what the schema says and nothing else exercises: defaults,
 * `required` (asserted per field, the only guard against a persisted row that later breaks every
 * reader), and `select: false` on credentials. Real Mongo, because these are Mongoose's
 * behaviours rather than ours — a mock would only assert its own opinion of what `default` means.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { orderRepository } from '@modules/orders';
import { createProduct } from '@modules/products/tests/fixtures';
import { createUser } from '@modules/users/tests/fixtures';

setupTestDb();

/**
 * A complete, valid order payload: a real buyer and a real product snapshot.
 * `items[].product` embeds the whole `productSchema`, not a reference, since an order is a
 * snapshot — a bare ObjectId fails validation here because title and price are required on the
 * embedded copy.
 */
const makeOrderPayload = async () => {
    const user = await createUser({ email: 'buyer@example.com' });
    const product = await createProduct({ title: 'Bought', price: 12.5 });
    return {
        userId: user._id,
        email: user.email,
        items: [{ product: product.toObject(), quantity: 2 }]
    };
};

describe('order schema', () => {
    it('requires an email', async () => {
        const payload = await makeOrderPayload();

        await expect(
            orderRepository.create({ ...payload, email: undefined } as never)
        ).rejects.toThrow();
    });

    it('serialises to id, never _id or __v', async () => {
        const order = await orderRepository.create((await makeOrderPayload()) as never);

        const serialized = order.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(order._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });

    it('stamps createdAt and updatedAt', async () => {
        const order = await orderRepository.create((await makeOrderPayload()) as never);

        expect(order.createdAt).toBeInstanceOf(Date);
        expect(order.updatedAt).toBeInstanceOf(Date);
    });
});

/**
 * A cart is the one collection addressed by its owner rather than by its own id: `userId` is
 * `unique`, which is what makes "the user's cart" a complete address and lets every mutation be a
 * single upsert. The declarations below are the whole of that guarantee.
 */
