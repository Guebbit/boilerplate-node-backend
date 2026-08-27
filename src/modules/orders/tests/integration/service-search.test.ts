import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import { createOrder, toOrderItem } from '@modules/orders/tests/factory';
import * as orderService from '@modules/orders/service';
import type { OrderDocument } from '@modules/orders';

setupTestDb();

type OrderWithTotals = OrderDocument & {
    totalItems: number;
    totalQuantity: number;
    totalPrice: number;
};

/*
 * `totalItems`, `totalQuantity` and `totalPrice` are not stored — `applyOrderTransform` derives
 * them, and `.aggregate()` bypasses the schema's `toJSON`, so the only thing that puts them on a
 * result is the repository's `normalize` step. These assert that every read path runs it.
 */
describe('orderService.search — derived totals', () => {
    it('adds the totalItems computed field (number of distinct product lines)', async () => {
        const user = await createUser();
        const [p1, p2] = await Promise.all([
            createProduct({ price: 5 }),
            createProduct({ price: 10 })
        ]);

        // One order with two product lines
        await createOrder(user, [toOrderItem(p1, 1), toOrderItem(p2, 3)]);

        const { items } = await orderService.search();
        const [order] = items as OrderWithTotals[];

        // 2 distinct product lines → totalItems = 2
        expect(order.totalItems).toBe(2);
    });

    it('adds the totalQuantity computed field (sum of all quantities)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        // 4 units of the same product
        await createOrder(user, [toOrderItem(product, 4)]);

        const { items } = await orderService.search();
        const [order] = items as OrderWithTotals[];

        expect(order.totalQuantity).toBe(4);
    });

    it('adds the totalPrice computed field (sum of price × quantity)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 15 }); // $15 each

        await createOrder(user, [toOrderItem(product, 3)]); // 3 × 15 = $45

        const { items } = await orderService.search();
        const [order] = items as OrderWithTotals[];

        expect(order.totalPrice).toBe(45);
    });

    it('computes totals correctly for a multi-product order', async () => {
        const user = await createUser();
        const [p1, p2] = await Promise.all([
            createProduct({ price: 10 }), // 2 × $10 = $20
            createProduct({ price: 5 }) // 4 × $5  = $20
        ]);

        await createOrder(user, [toOrderItem(p1, 2), toOrderItem(p2, 4)]);

        const { items } = await orderService.search();
        const [order] = items as OrderWithTotals[];

        expect(order.totalItems).toBe(2); // 2 product lines
        expect(order.totalQuantity).toBe(6); // 2 + 4
        expect(order.totalPrice).toBe(40); // 20 + 20
    });
});

describe('orderService.search', () => {
    it('returns all orders with default pagination', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        await createOrder(user, [toOrderItem(product, 1)]);
        await createOrder(user, [toOrderItem(product, 2)]);

        const result = await orderService.search({});

        expect(result.items).toHaveLength(2);
        expect(result.meta.totalItems).toBe(2);
    });

    it('filters by userId', async () => {
        const user1 = await createUser({ email: 'u1@example.com', username: 'u1' });
        const user2 = await createUser({ email: 'u2@example.com', username: 'u2' });
        const product = await createProduct({ price: 10 });

        await createOrder(user1, [toOrderItem(product, 1)]);
        await createOrder(user2, [toOrderItem(product, 2)]);

        const result = await orderService.search({
            userId: user1._id.toString()
        });

        expect(result.items).toHaveLength(1);
    });

    it('filters by email (exact match)', async () => {
        const user1 = await createUser({
            email: 'alice@example.com',
            username: 'alice'
        });
        const user2 = await createUser({
            email: 'bob@example.com',
            username: 'bob'
        });
        const product = await createProduct({ price: 10 });

        await createOrder(user1, [toOrderItem(product, 1)]);
        await createOrder(user2, [toOrderItem(product, 2)]);

        const result = await orderService.search({ email: 'alice@example.com' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by order id', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        const target = await createOrder(user, [toOrderItem(product, 1)]);
        await createOrder(user, [toOrderItem(product, 2)]);

        const result = await orderService.search({
            id: target._id.toString()
        });

        expect(result.items).toHaveLength(1);
    });

    it('filters by productId (embedded product)', async () => {
        const user = await createUser();
        const [p1, p2] = await Promise.all([
            createProduct({ price: 10 }),
            createProduct({ price: 20 })
        ]);

        // order1 contains p1; order2 contains p2
        await createOrder(user, [toOrderItem(p1, 1)]);
        await createOrder(user, [toOrderItem(p2, 1)]);

        const result = await orderService.search({
            productId: p1._id.toString()
        });

        expect(result.items).toHaveLength(1);
    });

    it('paginates results correctly', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        for (let i = 0; i < 5; i++) {
            await createOrder(user, [toOrderItem(product, i + 1)]);
        }

        const page1 = await orderService.search({ page: 1, pageSize: 3 });
        const page2 = await orderService.search({ page: 2, pageSize: 3 });

        expect(page1.items).toHaveLength(3);
        expect(page2.items).toHaveLength(2);
        expect(page1.meta.totalPages).toBe(2);
        expect(page1.meta.totalItems).toBe(5);
    });

    it('includes computed fields (totalItems, totalQuantity, totalPrice)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25 });

        await createOrder(user, [toOrderItem(product, 3)]); // 3 × $25 = $75

        const result = await orderService.search({});
        const [order] = result.items as OrderWithTotals[];

        expect(order.totalItems).toBe(1);
        expect(order.totalQuantity).toBe(3);
        expect(order.totalPrice).toBe(75);
    });

    it('accepts a scope filter (e.g. restrict to a specific user)', async () => {
        const user1 = await createUser({ email: 'u1@example.com', username: 'u1' });
        const user2 = await createUser({ email: 'u2@example.com', username: 'u2' });
        const product = await createProduct({ price: 10 });

        await createOrder(user1, [toOrderItem(product, 1)]);
        await createOrder(user2, [toOrderItem(product, 2)]);

        // The scope parameter is a raw Mongoose filter merged into the $match stage
        const result = await orderService.search({}, { userId: user1._id });

        expect(result.items).toHaveLength(1);
    });

    it('returns empty results when no orders exist', async () => {
        const result = await orderService.search({});

        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
        expect(result.meta.totalPages).toBe(0);
    });
});
