/**
 * @module
 * Orders must never leak `_id`/`__v` on any response path — a real document (`toJSON`) or an
 * `.aggregate()` result (mapped manually via `applyOrderTransform`, since aggregation output is
 * plain JS and bypasses `toJSON` just like `.lean()` does). The embedded product snapshot must be
 * normalized too, and embedded items never carry their own `_id` (`orderItemSchema` sets
 * `_id: false`, since OpenAPI's `OrderItem` is `{product, quantity}` only).
 */
import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import * as orderService from '@modules/orders/service';
import { orderSchema } from '@modules/orders/model';

setupTestDb();

describe('order serialization', () => {
    it('normalizes a hydrated document, including the embedded product, via toJSON', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Snapshot Product' });
        const order = await createOrder(user, [toOrderItem(product, 2)]);

        const json = order.toJSON() as Record<string, unknown>;

        expect(json.id).toBe(order._id.toString());
        expect(JSON.stringify(json)).not.toContain('__v');

        const items = json.items as Record<string, unknown>[];
        expect(items[0]._id).toBeUndefined();
        const embeddedProduct = items[0].product as Record<string, unknown>;
        expect(embeddedProduct.id).toBe(product._id.toString());
        expect(embeddedProduct._id).toBeUndefined();
    });

    it('normalizes aggregate results (search) the same way', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Aggregate Product' });
        await createOrder(user, [toOrderItem(product, 1)]);

        const { items: orders } = await orderService.search();
        const raw = asStub<Record<string, unknown>>(orders[0]);

        expect(raw.id).toMatch(/^[\da-f]{24}$/);
        expect(raw._id).toBeUndefined();
        const items = raw.items as Record<string, unknown>[];
        expect(items[0]._id).toBeUndefined();
        expect((items[0].product as Record<string, unknown>)._id).toBeUndefined();
    });

    it('normalizes aggregate results (search) the same way', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Search Product' });
        await createOrder(user, [toOrderItem(product, 1)]);

        const { items } = await orderService.search({});
        const raw = asStub<Record<string, unknown>>(items[0]);

        expect(raw.id).toMatch(/^[\da-f]{24}$/);
        expect(raw._id).toBeUndefined();
    });

    it('normalizes a scoped aggregate lookup (getById with scope) the same way', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Scoped Product' });
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const found = await orderService.getById(order._id.toString(), {
            userId: user._id
        });
        const raw = asStub<Record<string, unknown>>(found);

        expect(raw.id).toBe(order._id.toString());
        expect(raw._id).toBeUndefined();
    });
});

describe('embedded product snapshot indexes', () => {
    it('does not let the embedded product schema smuggle its indexes into orders', () => {
        /*
         * Mongoose copies a nested schema's indexes onto the schema that embeds it. Without
         * `excludeIndexes` on `items.product`, every order would silently gain an index over
         * `productSchema`'s fields — paid for on each insert, matched by no query. This lives
         * here because it is a fact about this module's schema, not the generic index suite.
         */
        const smuggled = orderSchema
            .indexes()
            .map(([key]) => Object.keys(key).join(' + '))
            .filter((paths) => paths.includes('product'));

        expect(smuggled).toEqual([]);
    });
});
