import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import OrderService from '@services/orders';
import OrderRepository from '@repositories/orders';
import ProductRepository from '@repositories/products';
import UserRepository from '@repositories/users';
import type { IOrderDocument } from '@models/orders';
import type { IProductDocument } from '@models/products';
import type { IUserDocument } from '@models/users';

/**
 * Order Service unit tests.
 * Validates the business-logic layer (getAll, search) against a live MongoDB
 * instance, using real fixture data so that aggregation pipelines are exercised end-to-end.
 *
 * Requires a running MongoDB instance (NODE_DB_URI env var).
 */
describe('Order Service', () => {
    /**
     * Supporting fixtures created in beforeAll and cleaned up in afterAll.
     */
    let testProduct: IProductDocument;
    let testUser:    IUserDocument;
    let testOrder:   IOrderDocument;

    /**
     * Connect to the database and seed the minimal fixtures required
     * to exercise the service search / filter logic.
     */
    beforeAll(async () => {
        await mongoose.connect(process.env.NODE_DB_URI ?? '');

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
            userId: testUser._id as Types.ObjectId,
            email:  testUser.email,
            products: [
                {
                    product:  testProduct.toObject(),
                    quantity: 3,
                },
            ],
        });
    });

    // ---------------------------------------------------------------------------
    // getAll
    // ---------------------------------------------------------------------------

    it('getAll returns an array of order documents', async () => {
        const results = await OrderService.getAll();
        expect(Array.isArray(results)).toBe(true);
    });

    it('getAll adds computed fields (totalItems, totalQuantity, totalPrice)', async () => {
        const userId  = testUser._id as Types.ObjectId;
        const results = await OrderService.getAll([
            { $match: { userId } },
        ]);
        expect(results.length).toBeGreaterThan(0);

        // Computed fields are added by the shared addComputedFields $addFields stage
        const order = results[0] as IOrderDocument & {
            totalItems:    number;
            totalQuantity: number;
            totalPrice:    number;
        };
        expect(typeof order.totalItems).toBe('number');
        expect(typeof order.totalQuantity).toBe('number');
        expect(typeof order.totalPrice).toBe('number');
        // Our fixture has 1 product line and quantity 3 at price 29.99
        expect(order.totalItems).toBe(1);
        expect(order.totalQuantity).toBe(3);
        expect(order.totalPrice).toBeCloseTo(3 * 29.99, 1);
    });

    it('getAll with a $match stage filters results', async () => {
        const results = await OrderService.getAll([
            { $match: { userId: new Types.ObjectId('000000000000000000000000') } },
        ]);
        expect(results).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // search – pagination
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

    // ---------------------------------------------------------------------------
    // search – filter by email
    // ---------------------------------------------------------------------------

    it('search with email filter finds the seeded order', async () => {
        const result = await OrderService.search({ email: 'service-order-test@example.com' });
        const found  = result.items.some(
            (o) => String(o.id) === (testOrder._id as Types.ObjectId).toString(),
        );
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
        const userId = (testUser._id as Types.ObjectId).toString();
        const result = await OrderService.search({ userId });
        const found  = result.items.some(
            (o) => String(o.id) === (testOrder._id as Types.ObjectId).toString(),
        );
        expect(found).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // search – filter by id (order id)
    // ---------------------------------------------------------------------------

    it('search with id filter finds the specific order', async () => {
        const id     = (testOrder._id as Types.ObjectId).toString();
        const result = await OrderService.search({ id });
        expect(result.meta.totalItems).toBe(1);
        expect(String(result.items[0].id)).toBe(id);
    });

    it('search with id filter returns empty for a non-existent order id', async () => {
        const result = await OrderService.search({ id: '000000000000000000000000' });
        expect(result.items).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // search – filter by productId
    // ---------------------------------------------------------------------------

    it('search with productId filter finds orders containing that product', async () => {
        const productId = (testProduct._id as Types.ObjectId).toString();
        const result    = await OrderService.search({ productId });
        const found     = result.items.some(
            (o) => String(o.id) === (testOrder._id as Types.ObjectId).toString(),
        );
        expect(found).toBe(true);
    });

    // ---------------------------------------------------------------------------
    // search – scope (additional query filter)
    // ---------------------------------------------------------------------------

    it('search with a scope filter restricts results to the given userId', async () => {
        const userId = testUser._id as Types.ObjectId;
        const result = await OrderService.search({}, { userId });
        expect(result.items.every((o) => String(o.userId) === userId.toString())).toBe(true);
    });

    it('search with a scope filter that matches nothing returns empty results', async () => {
        const result = await OrderService.search(
            {},
            { userId: new Types.ObjectId('000000000000000000000000') },
        );
        expect(result.items).toHaveLength(0);
    });

    // ---------------------------------------------------------------------------
    // Cleanup
    // ---------------------------------------------------------------------------

    /**
     * Remove all fixtures created during the test run and disconnect.
     */
    afterAll(async () => {
        if (testOrder)
            await mongoose.connection.collection('orders').deleteOne({
                _id: testOrder._id as Types.ObjectId,
            });
        if (testProduct)
            await ProductRepository.deleteOne(testProduct);
        if (testUser)
            await UserRepository.deleteOne(testUser);
        return mongoose.disconnect();
    });
});
