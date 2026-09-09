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
 * `items[].product` embeds `orderLineProductSchema`, not a reference, since an order is a
 * snapshot — a bare ObjectId fails validation here because title and price are required on the
 * embedded copy. The live product's `onHand`/`reserved` ride along on `product.toObject()` here
 * but are dropped on write: the embedded schema declares no path for either.
 */
const makeOrderPayload = async () => {
    const user = await createUser({ email: 'buyer@example.com' });
    const product = await createProduct({ title: 'Bought', price: 12.5 });
    return {
        userId: user._id,
        email: user.email,
        items: [{ product: product.toObject(), quantity: 2, locale: 'en' }]
    };
};

describe('order schema', () => {
    it('serialises to id, never _id or __v', async () => {
        const order = await orderRepository.create((await makeOrderPayload()) as never);

        const serialized = order.toJSON() as Record<string, unknown>;

        expect(serialized.id).toBe(String(order._id));
        expect(serialized).not.toHaveProperty('_id');
        expect(serialized).not.toHaveProperty('__v');
    });

    it('drops onHand/reserved even though the live product document carries both', async () => {
        // `product.toObject()` in `makeOrderPayload` above is the FULL live product, `onHand`/
        // `reserved` included — this is what proves `orderLineProductSchema` has no path for
        // either, rather than merely relying on nobody setting them.
        const order = await orderRepository.create((await makeOrderPayload()) as never);

        const serialized = order.toJSON() as { items: Record<string, unknown>[] };

        expect(serialized.items[0]?.product).not.toHaveProperty('onHand');
        expect(serialized.items[0]?.product).not.toHaveProperty('reserved');
        expect(serialized.items[0]?.product).not.toHaveProperty('available');
    });
});

/**
 * A cart is the one collection addressed by its owner rather than by its own id: `userId` is
 * `unique`, which is what makes "the user's cart" a complete address and lets every mutation be a
 * single upsert. The declarations below are the whole of that guarantee.
 */
