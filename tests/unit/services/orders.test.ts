import { connect, disconnect, clearAll } from '../../helpers/database';
import { createUser } from '../../helpers/factories/users';
import { createProduct } from '../../helpers/factories/products';
import { createOrder, toOrderProduct } from '../../helpers/factories/orders';
import * as orderService from '@services/orders';
import type { IOrderDocument } from '@models/orders';

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearAll);

type OrderWithTotals = IOrderDocument & {
    totalItems: number;
    totalQuantity: number;
    totalPrice: number;
};

describe('orderService.getAll', () => {
    it('returns all orders when no extra pipeline stages are provided', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        await createOrder(user, [toOrderProduct(product, 1)]);
        await createOrder(user, [toOrderProduct(product, 2)]);

        const orders = await orderService.getAll();

        expect(orders).toHaveLength(2);
    });

    it('adds the totalItems computed field (number of distinct product lines)', async () => {
        const user = await createUser();
        const [p1, p2] = await Promise.all([
            createProduct({ price: 5 }),
            createProduct({ price: 10 })
        ]);

        // One order with two product lines
        await createOrder(user, [toOrderProduct(p1, 1), toOrderProduct(p2, 3)]);

        const [order] = (await orderService.getAll()) as OrderWithTotals[];

        // 2 distinct product lines → totalItems = 2
        expect(order.totalItems).toBe(2);
    });

    it('adds the totalQuantity computed field (sum of all quantities)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        // 4 units of the same product
        await createOrder(user, [toOrderProduct(product, 4)]);

        const [order] = (await orderService.getAll()) as OrderWithTotals[];

        expect(order.totalQuantity).toBe(4);
    });

    it('adds the totalPrice computed field (sum of price × quantity)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 15 }); // $15 each

        await createOrder(user, [toOrderProduct(product, 3)]); // 3 × 15 = $45

        const [order] = (await orderService.getAll()) as OrderWithTotals[];

        expect(order.totalPrice).toBe(45);
    });

    it('computes totals correctly for a multi-product order', async () => {
        const user = await createUser();
        const [p1, p2] = await Promise.all([
            createProduct({ price: 10 }), // 2 × $10 = $20
            createProduct({ price: 5 }) // 4 × $5  = $20
        ]);

        await createOrder(user, [toOrderProduct(p1, 2), toOrderProduct(p2, 4)]);

        const [order] = (await orderService.getAll()) as OrderWithTotals[];

        expect(order.totalItems).toBe(2); // 2 product lines
        expect(order.totalQuantity).toBe(6); // 2 + 4
        expect(order.totalPrice).toBe(40); // 20 + 20
    });

    it('accepts additional query stages (e.g. match)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        const target = await createOrder(user, [toOrderProduct(product, 1)]);
        await createOrder(user, [toOrderProduct(product, 2)]);

        // Only fetch the specific order
        const orders = await orderService.getAll([{ match: { id: target.id } }]);

        expect(orders).toHaveLength(1);
    });

    it('returns an empty array when there are no orders', async () => {
        const orders = await orderService.getAll();
        expect(orders).toHaveLength(0);
    });
});

describe('orderService.search', () => {
    it('returns all orders with default pagination', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        await createOrder(user, [toOrderProduct(product, 1)]);
        await createOrder(user, [toOrderProduct(product, 2)]);

        const result = await orderService.search({});

        expect(result.items).toHaveLength(2);
        expect(result.meta.totalItems).toBe(2);
    });

    it('filters by userId', async () => {
        const user1 = await createUser({ email: 'u1@example.com', username: 'u1' });
        const user2 = await createUser({ email: 'u2@example.com', username: 'u2' });
        const product = await createProduct({ price: 10 });

        await createOrder(user1, [toOrderProduct(product, 1)]);
        await createOrder(user2, [toOrderProduct(product, 2)]);

        const result = await orderService.search({
            userId: user1.id.toString()
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

        await createOrder(user1, [toOrderProduct(product, 1)]);
        await createOrder(user2, [toOrderProduct(product, 2)]);

        const result = await orderService.search({ email: 'alice@example.com' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by order id', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        const target = await createOrder(user, [toOrderProduct(product, 1)]);
        await createOrder(user, [toOrderProduct(product, 2)]);

        const result = await orderService.search({
            id: target.id.toString()
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
        await createOrder(user, [toOrderProduct(p1, 1)]);
        await createOrder(user, [toOrderProduct(p2, 1)]);

        const result = await orderService.search({
            productId: p1.id.toString()
        });

        expect(result.items).toHaveLength(1);
    });

    it('paginates results correctly', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        for (let i = 0; i < 5; i++) {
            await createOrder(user, [toOrderProduct(product, i + 1)]);
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

        await createOrder(user, [toOrderProduct(product, 3)]); // 3 × $25 = $75

        const result = await orderService.search({});
        const [order] = result.items as unknown as OrderWithTotals[];

        expect(order.totalItems).toBe(1);
        expect(order.totalQuantity).toBe(3);
        expect(order.totalPrice).toBe(75);
    });

    it('accepts a scope filter (e.g. restrict to a specific user)', async () => {
        const user1 = await createUser({ email: 'u1@example.com', username: 'u1' });
        const user2 = await createUser({ email: 'u2@example.com', username: 'u2' });
        const product = await createProduct({ price: 10 });

        await createOrder(user1, [toOrderProduct(product, 1)]);
        await createOrder(user2, [toOrderProduct(product, 2)]);

        // The scope parameter is merged into the match stage
        const result = await orderService.search({}, { userId: user1.id });

        expect(result.items).toHaveLength(1);
    });

    it('returns empty results when no orders exist', async () => {
        const result = await orderService.search({});

        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
        expect(result.meta.totalPages).toBe(0);
    });
});
