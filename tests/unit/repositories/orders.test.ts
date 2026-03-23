import 'dotenv/config';
import mongoose, { Types } from 'mongoose';
import OrderRepository from '@repositories/orders';
import ProductRepository from '@repositories/products';
import UserRepository from '@repositories/users';
import type { IOrderDocument } from '@models/orders';
import type { IProductDocument } from '@models/products';
import type { IUserDocument } from '@models/users';

/**
 * Order Repository unit tests.
 * Validates the aggregate and create methods directly against a live MongoDB instance,
 * without going through the service layer.
 *
 * Requires a running MongoDB instance (NODE_DB_URI env var).
 */
describe('Order Repository', () => {
    /**
     * Supporting fixtures created in beforeAll and cleaned up in afterAll.
     */
    let testProduct: IProductDocument;
    let testUser:    IUserDocument;
    let testOrder:   IOrderDocument;

    /**
     * Connect to the database and create minimal supporting fixtures
     * (a product and a user) required to compose a valid order.
     */
    beforeAll(async () => {
        await mongoose.connect(process.env.NODE_DB_URI ?? '');

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
            userId: testUser._id as Types.ObjectId,
            email:  testUser.email,
            products: [
                {
                    product:  testProduct.toObject(),
                    quantity: 2,
                },
            ],
        });
        expect(testOrder).toBeDefined();
        expect(testOrder.email).toBe('order-repo-test@example.com');
        expect(testOrder.products.length).toBe(1);
        expect(testOrder.products[0].quantity).toBe(2);
        expect((testOrder._id as Types.ObjectId).toString()).toHaveLength(24);
    });

    // ---------------------------------------------------------------------------
    // aggregate
    // ---------------------------------------------------------------------------

    it('aggregate with an empty pipeline returns all orders', async () => {
        const results = await OrderRepository.aggregate([]);
        expect(Array.isArray(results)).toBe(true);
        expect(results.length).toBeGreaterThan(0);
    });

    it('aggregate with a $match stage filters by userId', async () => {
        const userId  = testUser._id as Types.ObjectId;
        const results = await OrderRepository.aggregate([
            { $match: { userId } },
        ]);
        expect(results.length).toBeGreaterThan(0);
        expect(results.every(o => o.userId.toString() === userId.toString())).toBe(true);
    });

    it('aggregate with a $match stage returns empty array for non-matching filter', async () => {
        const results = await OrderRepository.aggregate([
            { $match: { userId: new Types.ObjectId('000000000000000000000000') } },
        ]);
        expect(results).toHaveLength(0);
    });

    it('aggregate with $addFields adds computed fields to each document', async () => {
        const userId  = testUser._id as Types.ObjectId;
        const results = await OrderRepository.aggregate([
            { $match: { userId } },
            {
                $addFields: {
                    totalItems:    { $size: '$products' },
                    totalQuantity: { $sum: '$products.quantity' },
                },
            },
        ]);
        expect(results.length).toBeGreaterThan(0);
        const order = results[0] as IOrderDocument & { totalItems: number; totalQuantity: number };
        expect(order.totalItems).toBe(1);
        expect(order.totalQuantity).toBe(2);
    });

    it('aggregate with $count returns the document count', async () => {
        const [countResult] = await OrderRepository.aggregate<{ total: number }>([
            { $count: 'total' },
        ]);
        expect(countResult).toBeDefined();
        expect(typeof countResult.total).toBe('number');
        expect(countResult.total).toBeGreaterThan(0);
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
