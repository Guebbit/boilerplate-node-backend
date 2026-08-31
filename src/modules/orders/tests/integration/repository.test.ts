/**
 * @module
 * `orderRepository` — inserts through the fixture builder, the raw `.aggregate()` passthrough
 * `orderService.search` is built on, and `findByIdScoped`'s two branches (unscoped/admin vs
 * scoped/owner). The aggregate cases pin that the repository does not reshape Mongo's pipeline
 * stages, so `$match`/`$count`/`$addFields`/pagination stay a deliberate design rather than an
 * untested assumption. `findByIdScoped` gets its own block below since its two branches resolve
 * structurally different values, and `id` is the only field both agree on.
 */
import { asStub } from '@tests/stub';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/fixtures';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, makeOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import type { ProductDocument } from '@modules/products';
import { orderRepository } from '@modules/orders';
import { DEFAULT_SORT } from '@infrastructure/persistence/search';

setupTestDb();

describe('orderRepository', () => {
    describe('create', () => {
        it('inserts an order and returns the Mongoose document', async () => {
            const user = await createUser();
            const product = await createProduct({ price: 15 });
            const order = await createOrder(user, [toOrderItem(product, 2)]);

            expect(order._id).toBeDefined();
            expect(order.email).toBe(user.email);
            expect(order.userId.toString()).toBe(user._id.toString());
        });

        it('stores the correct quantity for each order line', async () => {
            const user = await createUser();
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 5)]);

            expect(order.items).toHaveLength(1);
            expect(order.items[0].quantity).toBe(5);
        });

        it('stores the full product snapshot (title, price) in the order', async () => {
            const user = await createUser();
            const product = await createProduct({
                title: 'Snapshot Test',
                price: 29.99
            });
            const order = await createOrder(user, [toOrderItem(product, 1)]);

            // The product object is embedded, not referenced by ObjectId
            const snapshot = order.items[0].product as ProductDocument;
            expect(snapshot.title).toBe('Snapshot Test');
            expect(snapshot.price).toBe(29.99);
        });

        it('supports multiple products in a single order', async () => {
            const user = await createUser();
            const [p1, p2] = await Promise.all([
                createProduct({ title: 'Product 1' }),
                createProduct({ title: 'Product 2' })
            ]);
            const order = await createOrder(user, [toOrderItem(p1, 1), toOrderItem(p2, 3)]);

            expect(order.items).toHaveLength(2);
        });
    });

    describe('aggregate', () => {
        it('returns all orders when given a match-all pipeline', async () => {
            const user = await createUser();
            const product = await createProduct();
            await createOrder(user, [toOrderItem(product, 1)]);
            await createOrder(user, [toOrderItem(product, 2)]);

            // An empty $match stage matches every document.
            // MongoDB (and Mongoose) require at least one stage; passing an
            // empty array throws MongooseError: Aggregate has empty pipeline.
            const results = await orderRepository.aggregate([{ $match: {} }]);

            expect(results).toHaveLength(2);
        });

        it('applies a $match stage to filter results', async () => {
            const user = await createUser();
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);

            // Only orders for this specific user
            const results = await orderRepository.aggregate([{ $match: { userId: order.userId } }]);

            expect(results).toHaveLength(1);
        });

        it('applies a $count stage and returns the document count', async () => {
            const user = await createUser();
            const product = await createProduct();
            await createOrder(user, [toOrderItem(product, 1)]);
            await createOrder(user, [toOrderItem(product, 2)]);
            await createOrder(user, [toOrderItem(product, 3)]);

            const [result] = await orderRepository.aggregate<{ total: number }>([
                { $count: 'total' }
            ]);

            expect(result.total).toBe(3);
        });

        it('adds computed fields with $addFields', async () => {
            const user = await createUser();
            const product = await createProduct({ price: 10 });
            await createOrder(user, [toOrderItem(product, 4)]);

            // Manually compute totalPrice the same way the Order service does
            const [result] = await orderRepository.aggregate<{
                totalQuantity: number;
                totalPrice: number;
            }>([
                {
                    $addFields: {
                        totalQuantity: { $sum: '$items.quantity' },
                        totalPrice: {
                            $sum: {
                                $map: {
                                    input: '$items',
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
                await orderRepository.create(makeOrder(user, [toOrderItem(product, i + 1)]));
            }

            const page2 = await orderRepository.aggregate([
                // The tiebreaker rides along here too: a page is only well-defined when the sort
                // preceding its `$skip` is total. See `DEFAULT_SORT`.
                { $sort: DEFAULT_SORT },
                { $skip: 3 },
                { $limit: 10 }
            ]);

            // 5 total, skip 3 → 2 remaining
            expect(page2).toHaveLength(2);
        });
    });

    /**
     * `findByIdScoped` resolves structurally different values by scope — hydrated document
     * (unscoped) vs already-transformed aggregate row (scoped) — so `id` is the only field both
     * guarantee; `_id` type-checks but isn't reliably present. Pinned here because neither
     * TypeScript nor a response-body assertion can catch the gap before serialization.
     */
    describe('findByIdScoped', () => {
        it('exposes a usable `id` on both the scoped and the unscoped branch', async () => {
            const user = await createUser();
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);
            const expected = order._id.toString();

            const asAdmin = await orderRepository.findByIdScoped(expected);
            const asOwner = await orderRepository.findByIdScoped(
                expected,
                orderRepository.visibleScope(String(user._id))
            );

            // Not `toBeDefined()`: the failure this guards against is a value that stringifies
            // to the literal 'undefined', which is defined enough to pass a laxer assertion.
            expect(String(asStub<{ id?: unknown }>(asAdmin).id)).toBe(expected);
            expect(String(asStub<{ id?: unknown }>(asOwner).id)).toBe(expected);
        });

        it('drops `_id` on the scoped branch, which is why `id` is the field to read', async () => {
            const user = await createUser();
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);

            const asOwner = await orderRepository.findByIdScoped(
                String(order._id),
                orderRepository.visibleScope(String(user._id))
            );

            // The serializer deletes `_id` after writing `id`. Asserted here rather than left
            // implicit: it is the half of the contract that makes reading `_id` a silent,
            // role-dependent bug instead of a loud one.
            expect(asOwner).toBeDefined();
            expect(asStub<{ _id?: unknown }>(asOwner)._id).toBeUndefined();
        });

        it('still refuses an order the scope does not cover', async () => {
            // The polymorphism must not cost the authorization property the scope is there for.
            // Distinct emails, not the factory default: `users.email` is unique.
            const [owner, stranger] = await Promise.all([
                createUser({ email: 'owner@example.com' }),
                createUser({ email: 'stranger@example.com' })
            ]);
            const product = await createProduct();
            const order = await createOrder(owner, [toOrderItem(product, 1)]);

            const asStranger = await orderRepository.findByIdScoped(
                String(order._id),
                orderRepository.visibleScope(String(stranger._id))
            );

            expect(asStranger).toBeUndefined();
        });
    });
});
