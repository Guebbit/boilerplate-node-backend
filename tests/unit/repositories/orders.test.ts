import { Types } from 'mongoose';
import { connect, disconnect, clearAll } from '../../helpers/database';
import { createUser } from '../../helpers/factories/users';
import { createProduct } from '../../helpers/factories/products';
import { createOrder, makeOrder, toOrderProduct } from '../../helpers/factories/orders';
import * as orderRepository from '@repositories/orders';

beforeAll(connect);
afterAll(disconnect);
beforeEach(clearAll);

describe('orderRepository', () => {
    describe('create', () => {
        it('inserts an order and returns the Mongoose document', async () => {
            const user = await createUser();
            const product = await createProduct({ price: 15 });
            // toOrderProduct converts the product document into the embedded shape
            const order = await createOrder(user, [toOrderProduct(product, 2)]);

            expect(order._id).toBeDefined();
            expect(order.email).toBe(user.email);
            expect(order.userId.toString()).toBe((user._id as Types.ObjectId).toString());
        });

        it('stores the correct quantity for each order line', async () => {
            const user = await createUser();
            const product = await createProduct();
            const order = await createOrder(user, [toOrderProduct(product, 5)]);

            expect(order.products).toHaveLength(1);
            expect(order.products[0].quantity).toBe(5);
        });

        it('stores the full product snapshot (title, price) in the order', async () => {
            const user = await createUser();
            const product = await createProduct({ title: 'Snapshot Test', price: 29.99 });
            const order = await createOrder(user, [toOrderProduct(product, 1)]);

            // The product object is embedded, not referenced by ObjectId
            expect(order.products[0].product.title).toBe('Snapshot Test');
            expect(order.products[0].product.price).toBe(29.99);
        });

        it('supports multiple products in a single order', async () => {
            const user = await createUser();
            const [p1, p2] = await Promise.all([
                createProduct({ title: 'Product 1' }),
                createProduct({ title: 'Product 2' })
            ]);
            const order = await createOrder(user, [toOrderProduct(p1, 1), toOrderProduct(p2, 3)]);

            expect(order.products).toHaveLength(2);
        });
    });

    describe('aggregate', () => {
        it('returns all orders when given a match-all pipeline', async () => {
            const user = await createUser();
            const product = await createProduct();
            await createOrder(user, [toOrderProduct(product, 1)]);
            await createOrder(user, [toOrderProduct(product, 2)]);

            // An empty $match stage matches every document.
            // MongoDB (and Mongoose) require at least one stage; passing an
            // empty array throws MongooseError: Aggregate has empty pipeline.
            const results = await orderRepository.aggregate([{ $match: {} }]);

            expect(results).toHaveLength(2);
        });

        it('applies a $match stage to filter results', async () => {
            const user = await createUser();
            const product = await createProduct();
            const order = await createOrder(user, [toOrderProduct(product, 1)]);

            // Only orders for this specific user
            const results = await orderRepository.aggregate([{ $match: { userId: order.userId } }]);

            expect(results).toHaveLength(1);
        });

        it('applies a $count stage and returns the document count', async () => {
            const user = await createUser();
            const product = await createProduct();
            await createOrder(user, [toOrderProduct(product, 1)]);
            await createOrder(user, [toOrderProduct(product, 2)]);
            await createOrder(user, [toOrderProduct(product, 3)]);

            const [result] = await orderRepository.aggregate<{ total: number }>([
                { $count: 'total' }
            ]);

            expect(result.total).toBe(3);
        });

        it('adds computed fields with $addFields', async () => {
            const user = await createUser();
            const product = await createProduct({ price: 10 });
            await createOrder(user, [toOrderProduct(product, 4)]);

            // Manually compute totalPrice the same way the Order service does
            const [result] = await orderRepository.aggregate<{
                totalQuantity: number;
                totalPrice: number;
            }>([
                {
                    $addFields: {
                        totalQuantity: { $sum: '$products.quantity' },
                        totalPrice: {
                            $sum: {
                                $map: {
                                    input: '$products',
                                    as: 'p',
                                    in: { $multiply: ['$$p.product.price', '$$p.quantity'] }
                                }
                            }
                        }
                    }
                }
            ]);

            expect(result.totalQuantity).toBe(4);
            expect(result.totalPrice).toBe(40); // 10 × 4
        });

        it('handles the $sort + $skip + $limit pagination pattern', async () => {
            const user = await createUser();
            const product = await createProduct();
            // Insert 5 orders
            for (let i = 0; i < 5; i++) {
                await orderRepository.create(makeOrder(user, [toOrderProduct(product, i + 1)]));
            }

            const page2 = await orderRepository.aggregate([
                { $sort: { createdAt: -1 } },
                { $skip: 3 },
                { $limit: 10 }
            ]);

            // 5 total, skip 3 → 2 remaining
            expect(page2).toHaveLength(2);
        });
    });
});
