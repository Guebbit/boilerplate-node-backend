// Set test environment BEFORE any imports so the in-memory SQLite DB is used
process.env.NODE_ENV = 'test';

import { sequelize } from '@utils/database';
import OrderService from '@services/orders';
import OrderRepository from '@repositories/orders';
import ProductRepository from '@repositories/products';
import UserRepository from '@repositories/users';
import type { IOrderDocument } from '@models/orders';
import type { IProductDocument } from '@models/products';
import type { IUserDocument } from '@models/users';

/**
 * Order Service unit tests.
 * Validates the business-logic layer (search) against an in-memory SQLite database,
 * using real fixture data so that SQL queries are exercised end-to-end.
 */
describe('Order Service', () => {
    /**
     * Supporting fixtures created in beforeAll and cleaned up in afterAll.
     */
    let testProduct: IProductDocument;
    let testUser:    IUserDocument;
    let testOrder:   IOrderDocument;

    /**
     * Sync the database and seed the minimal fixtures required
     * to exercise the service search / filter logic.
     */
    beforeAll(async () => {
        await sequelize.sync({ force: true });

        testProduct = await ProductRepository.create({
            title:    'Service Order Test Product',
            price:    29.99,
            imageUrl: '/images/service-order-test.jpg',
            active:   true,
        });

        testUser = await UserRepository.create({
            email:    'service-order-test@example.com',
            username: 'ServiceOrderTest',
            password: 'plainpassword123',
            admin:    false,
        });

        testOrder = await OrderRepository.create({
            userId: testUser.id,
            email:  testUser.email,
            products: [
                {
                    product: {
                        id:       testProduct.id,
                        title:    testProduct.title,
                        price:    testProduct.price,
                        imageUrl: testProduct.imageUrl,
                        active:   testProduct.active,
                    },
                    quantity: 3,
                },
            ],
        });
    });

    // ---------------------------------------------------------------------------
    // search – basics
    // ---------------------------------------------------------------------------

    it('search returns a paginated result object with meta', async () => {
        const result = await OrderService.search({ page: 1, pageSize: 5 });
        expect(result).toHaveProperty('items');
        expect(result).toHaveProperty('meta');
        expect(Array.isArray(result.items)).toBe(true);
        expect(result.meta.page).toBe(1);
        expect(result.meta.pageSize).toBe(5);
        expect(typeof result.meta.totalItems).toBe('number');
        expect(typeof result.meta.totalPages).toBe('number');
    });

    it('search clamps pageSize to a maximum of 100', async () => {
        const result = await OrderService.search({ page: 1, pageSize: 9999 });
        expect(result.meta.pageSize).toBe(100);
    });

    it('search clamps page to a minimum of 1', async () => {
        const result = await OrderService.search({ page: -5 });
        expect(result.meta.page).toBe(1);
    });

    it('search results include computed totals (totalItems, totalQuantity, totalPrice)', async () => {
        const result = await OrderService.search({ id: String(testOrder.id) });
        expect(result.items.length).toBeGreaterThan(0);
        const order = result.items[0];
        expect(typeof order.totalItems).toBe('number');
        expect(typeof order.totalQuantity).toBe('number');
        expect(typeof order.totalPrice).toBe('number');
        expect(order.totalItems).toBe(1);
        expect(order.totalQuantity).toBe(3);
        expect(order.totalPrice).toBeCloseTo(3 * 29.99, 1);
    });

    // ---------------------------------------------------------------------------
    // search – filter by email
    // ---------------------------------------------------------------------------

    it('search with email filter finds the seeded order', async () => {
        const result = await OrderService.search({ email: 'service-order-test@example.com' });
        const found  = result.items.some(o => o.id === testOrder.id);
        expect(found).toBe(true);
    });

    it('search with email filter returns empty results for a non-matching email', async () => {
        const result = await OrderService.search({ email: 'nobody@example.com' });
        expect(result.items).toHaveLength(0);
        expect(result.meta.totalItems).toBe(0);
    });

    // ---------------------------------------------------------------------------
    // search – filter by userId
    // ---------------------------------------------------------------------------

    it('search with userId filter finds the seeded order', async () => {
        const result = await OrderService.search({ userId: String(testUser.id) });
        const found  = result.items.some(o => o.id === testOrder.id);
        expect(found).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // search – filter by id (order id)
    // ---------------------------------------------------------------------------

    it('search with id filter finds the specific order', async () => {
        const result = await OrderService.search({ id: String(testOrder.id) });
        expect(result.meta.totalItems).toBe(1);
        expect(result.items[0].id).toBe(testOrder.id);
    });

    it('search with id filter returns empty for a non-existent order id', async () => {
        const result = await OrderService.search({ id: '999999' });
        expect(result.items).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // search – filter by productId
    // ---------------------------------------------------------------------------

    it('search with productId filter finds orders containing that product', async () => {
        const result = await OrderService.search({ productId: String(testProduct.id) });
        const found  = result.items.some(o => o.id === testOrder.id);
        expect(found).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // search – scope (additional query filter)
    // ---------------------------------------------------------------------------

    it('search with a scope filter restricts results to the given userId', async () => {
        const result = await OrderService.search({}, { userId: testUser.id });
        expect(result.items.every(o => o.userId === testUser.id)).toBe(true);
    });

    it('search with a scope filter that matches nothing returns empty results', async () => {
        const result = await OrderService.search({}, { userId: 999999 });
        expect(result.items).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    /**
     * Remove all fixtures created during the test run and close the connection.
     */
    afterAll(async () => {
        if (testProduct)
            await ProductRepository.deleteOne(testProduct);
        if (testUser)
            await UserRepository.deleteOne(testUser);
        await sequelize.close();
    });
});
