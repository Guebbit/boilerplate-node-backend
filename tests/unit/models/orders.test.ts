/**
 * Regression guard for PROPOSAL §1 (option A): orders must never leak `_id`/`__v`,
 * on any response path — a real document (`toJSON`) or an `.aggregate()` result
 * (mapped manually via `applyOrderTransform`, since aggregation output is plain
 * JS and bypasses `toJSON` just like `.lean()` does). The embedded product
 * snapshot must be normalized too (it reuses `productSchema` directly), and
 * embedded items must never carry their own `_id` (`orderItemSchema` sets
 * `_id: false`, since OpenAPI's `OrderItem` is `{product, quantity}` only).
 */
import { Types } from 'mongoose';
import { setupTestDb } from '../../helpers/setup-test-db';
import { createUser } from '../../helpers/factories/users';
import { createProduct } from '../../helpers/factories/products';
import { createOrder, toOrderItem } from '../../helpers/factories/orders';
import * as orderService from '@services/orders';

setupTestDb();

describe('order serialization', () => {
    it('normalizes a hydrated document, including the embedded product, via toJSON', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Snapshot Product' });
        const order = await createOrder(user, [toOrderItem(product, 2)]);

        const json = order.toJSON() as Record<string, unknown>;

        expect(json.id).toBe((order._id as Types.ObjectId).toString());
        expect(JSON.stringify(json)).not.toContain('__v');

        const items = json.items as Record<string, unknown>[];
        expect(items[0]._id).toBeUndefined();
        const embeddedProduct = items[0].product as Record<string, unknown>;
        expect(embeddedProduct.id).toBe((product._id as Types.ObjectId).toString());
        expect(embeddedProduct._id).toBeUndefined();
    });

    it('normalizes aggregate results (search) the same way', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Aggregate Product' });
        await createOrder(user, [toOrderItem(product, 1)]);

        const { items: orders } = await orderService.search();
        const raw = orders[0] as unknown as Record<string, unknown>;

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
        const raw = items[0] as unknown as Record<string, unknown>;

        expect(raw.id).toMatch(/^[\da-f]{24}$/);
        expect(raw._id).toBeUndefined();
    });

    it('normalizes a scoped aggregate lookup (getById with scope) the same way', async () => {
        const user = await createUser();
        const product = await createProduct({ title: 'Scoped Product' });
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const found = await orderService.getById((order._id as Types.ObjectId).toString(), {
            userId: user._id
        });
        const raw = found as unknown as Record<string, unknown>;

        expect(raw.id).toBe((order._id as Types.ObjectId).toString());
        expect(raw._id).toBeUndefined();
    });
});
