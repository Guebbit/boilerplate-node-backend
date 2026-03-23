// Set test environment BEFORE any imports so the in-memory SQLite DB is used
process.env.NODE_ENV = 'test';

import { sequelize } from '@utils/database';
import OrderRepository from '@repositories/orders';
import ProductRepository from '@repositories/products';
import UserRepository from '@repositories/users';
import type { IOrderDocument } from '@models/orders';
import type { IProductDocument } from '@models/products';
import type { IUserDocument } from '@models/users';

/**
 * Order Repository unit tests.
 * Validates the findAll and create methods against an in-memory SQLite database,
 * without going through the service layer.
 */
describe('Order Repository', () => {
    /**
     * Supporting fixtures created in beforeAll and cleaned up in afterAll.
     */
    let testProduct: IProductDocument;
    let testUser:    IUserDocument;
    let testOrder:   IOrderDocument;

    /**
     * Sync the database and create minimal supporting fixtures
     * (a product and a user) required to compose a valid order.
     */
    beforeAll(async () => {
        await sequelize.sync({ force: true });

        testProduct = await ProductRepository.create({
            title:    'Order Repo Test Product',
            price:    19.99,
            imageUrl: '/images/order-repo-test.jpg',
            active:   true,
        });

        testUser = await UserRepository.create({
            email:    'order-repo-test@example.com',
            username: 'OrderRepoTest',
            password: 'plainpassword123',
            admin:    false,
        });
    });

    // ---------------------------------------------------------------------------
    // create
    // ---------------------------------------------------------------------------

    it('create inserts a new order document and returns it', async () => {
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
                    quantity: 2,
                },
            ],
        });
        expect(testOrder).toBeDefined();
        expect(testOrder.email).toBe('order-repo-test@example.com');
        expect(testOrder.products.length).toBe(1);
        expect(testOrder.products[0].quantity).toBe(2);
        expect(typeof testOrder.id).toBe('number');
        expect(testOrder.id).toBeGreaterThan(0);
    });

    // ---------------------------------------------------------------------------
    // findAll
    // ---------------------------------------------------------------------------

    it('findAll with no filter returns all orders', async () => {
        const results = await OrderRepository.findAll();
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
    });

    it('findAll with a where filter scopes results by userId', async () => {
        const results = await OrderRepository.findAll({ where: { userId: testUser.id } });
        expect(results.length).toBeGreaterThan(0);
        expect(results.every(o => o.userId === testUser.id)).toBe(true);
    });

    it('findAll with a non-matching filter returns an empty array', async () => {
        const results = await OrderRepository.findAll({ where: { userId: 999999 } });
        expect(results).toHaveLength(0);
    });

    it('findAll includes computed totals (totalItems, totalQuantity, totalPrice)', async () => {
        const results = await OrderRepository.findAll({ where: { userId: testUser.id } });
        expect(results.length).toBeGreaterThan(0);
        const order = results[0];
        expect(typeof order.totalItems).toBe('number');
        expect(typeof order.totalQuantity).toBe('number');
        expect(typeof order.totalPrice).toBe('number');
        expect(order.totalItems).toBe(1);
        expect(order.totalQuantity).toBe(2);
        expect(order.totalPrice).toBeCloseTo(2 * 19.99, 1);
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    /**
     * Remove all fixtures created during the test run and close the connection.
     */
    afterAll(async () => {
        // Tables are dropped/recreated by force:true in the next test run;
        // explicit cleanup is a courtesy safety net.
        if (testProduct)
            await ProductRepository.deleteOne(testProduct);
        if (testUser)
            await UserRepository.deleteOne(testUser);
        await sequelize.close();
    });
});
