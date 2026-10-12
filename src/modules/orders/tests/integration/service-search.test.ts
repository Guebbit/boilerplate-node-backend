/**
 * @module
 * `orderService.search` — filtering, pagination, and the three computed totals
 * (`totalItems`/`totalQuantity`/`totalPrice`) that exist only because the aggregate pipeline
 * derives them; nothing stores them on the document. `service-crud.test.ts` covers the write
 * half of this service (`create`, `update`, `remove`, …).
 */
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, saveProduct, deleteProduct } from '@modules/products/tests/factories';
import { createOrder, orderRepository, toOrderItem } from '@modules/orders/tests/factories';
import * as orderService from '@modules/orders/services';

setupTestDb();

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
        const [order] = items;

        // 2 distinct product lines → totalItems = 2
        expect(order.totalItems).toBe(2);
    });

    it('adds the totalQuantity computed field (sum of all quantities)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        // 4 units of the same product
        await createOrder(user, [toOrderItem(product, 4)]);

        const { items } = await orderService.search();
        const [order] = items;

        expect(order.totalQuantity).toBe(4);
    });

    it('adds the totalPrice computed field (sum of price × quantity)', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 15 }); // $15 each

        await createOrder(user, [toOrderItem(product, 3)]); // 3 × 15 = $45

        const { items } = await orderService.search();
        const [order] = items;

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
        const [order] = items;

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

    it('filters by email regardless of the query casing', async () => {
        const user = await createUser({ email: 'alice@example.com', username: 'alice' });
        const product = await createProduct({ price: 10 });
        await createOrder(user, [toOrderItem(product, 1)]);

        const result = await orderService.search({ email: 'ALICE@Example.com' });

        expect(result.items).toHaveLength(1);
    });

    it('filters by paymentMethod — the admin "awaiting transfer" view', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        await createOrder(user, [toOrderItem(product, 1)], {
            status: 'pending',
            paymentMethod: 'bank_transfer'
        });
        await createOrder(user, [toOrderItem(product, 1)], {
            status: 'pending',
            paymentMethod: 'card'
        });

        const result = await orderService.search({
            paymentMethod: 'bank_transfer',
            status: 'pending'
        });

        expect(result.items).toHaveLength(1);
    });

    it('filters by order id', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });

        const target = await createOrder(user, [toOrderItem(product, 1)]);
        await createOrder(user, [toOrderItem(product, 2)]);

        const result = await orderService.search({
            id: [target._id.toString()]
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
        const [order] = result.items;

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

/*
 * The order line no longer freezes an image, so `current` is resolved LIVE from the catalogue
 * product every read — the three branches that matter are unchanged, replaced-since-purchase,
 * and gone.
 */
describe('orderService.search — current (live) image', () => {
    it('resolves the live imageUrl for an unchanged product', async () => {
        const user = await createUser();
        const product = await createProduct({ imageUrl: '/images/original.jpg' });

        await createOrder(user, [toOrderItem(product, 1)]);

        const { items } = await orderService.search({});

        expect(items[0].items[0].current).toEqual({ imageUrl: '/images/original.jpg' });
    });

    it('resolves the NEW imageUrl when the product changed since the order was placed', async () => {
        const user = await createUser();
        const product = await createProduct({ imageUrl: '/images/at-purchase.jpg' });

        await createOrder(user, [toOrderItem(product, 1)]);

        // The catalogue row changes after the order exists — the order line itself carries no
        // image at all to go stale, so this can only ever show the live one.
        product.imageUrl = '/images/replaced.jpg';
        await saveProduct(product);

        const { items } = await orderService.search({});

        expect(items[0].items[0].current).toEqual({ imageUrl: '/images/replaced.jpg' });
    });

    it('resolves an empty object for a product that never had a picture', async () => {
        const user = await createUser();
        const product = await createProduct();

        await createOrder(user, [toOrderItem(product, 1)]);

        const { items } = await orderService.search({});

        expect(items[0].items[0].current).toEqual({});
    });

    it('resolves null once the product has been hard-deleted', async () => {
        const user = await createUser();
        const product = await createProduct({ imageUrl: '/images/doomed.jpg' });

        await createOrder(user, [toOrderItem(product, 1)]);
        await deleteProduct(product);

        const { items } = await orderService.search({});

        expect(items[0].items[0].current).toBeNull();
    });
});

describe('orderService.search — the Awaiting-transfer view', () => {
    it('lists pending bank transfers by nearest payBy, soonest first', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 5 });
        const later = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer',
            payBy: '2026-07-20T00:00:00Z'
        });
        const sooner = await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'bank_transfer',
            payBy: '2026-07-10T00:00:00Z'
        });
        await createOrder(user, [toOrderItem(product, 1)], {
            paymentMethod: 'card',
            payBy: '2026-07-01T00:00:00Z'
        });

        const asc = await orderService.search({
            paymentMethod: 'bank_transfer',
            status: 'pending',
            sort: ['payBy']
        });
        const desc = await orderService.search({
            paymentMethod: 'bank_transfer',
            sort: ['-payBy']
        });

        expect(asc.items.map((order) => order.id)).toEqual([String(sooner._id), String(later._id)]);
        expect(desc.items.map((order) => order.id)).toEqual([
            String(later._id),
            String(sooner._id)
        ]);
    });
});

describe('orderService.findManyByIds', () => {
    it("answers each named order's number and email, and nothing for an unknown id", async () => {
        const user = await createUser();
        const product = await createProduct({ price: 5 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        await createOrder(user, [toOrderItem(product, 1)]);

        const found = await orderService.findManyByIds([
            String(order._id),
            '6acc1a53bafa7d9bbbad22c6'
        ]);

        expect(found).toEqual([
            { id: String(order._id), orderNumber: order.orderNumber, email: order.email }
        ]);
        expect(await orderService.findManyByIds([])).toEqual([]);
    });
});

/** One order per case, in a fresh user's name. */
const seed = async (extras: Parameters<typeof createOrder>[2]) => {
    const user = await createUser({ email: `buyer${String(Math.random())}@example.com` });
    const product = await createProduct({ price: 5 });
    return createOrder(user, [toOrderItem(product, 1)], extras);
};

/** The ids a search answers, sorted so the comparison ignores order. */
const sortedIds = (filters: Parameters<typeof orderService.search>[0]) =>
    orderService.search(filters).then(({ items }) => items.map((item) => item.id).toSorted());

/** The ids a search answers, in the order it answered them. */
const idsInOrder = (filters: Parameters<typeof orderService.search>[0]) =>
    orderService.search(filters).then(({ items }) => items.map((item) => item.id));

describe('orderService.search — the staff list filters', () => {
    it('narrows by creation date and by paid date, one-sided or both', async () => {
        const jan = await seed({
            createdAt: '2026-01-10T10:00:00Z',
            paidAt: '2026-01-11T10:00:00Z'
        });
        const mar = await seed({
            createdAt: '2026-03-10T10:00:00Z',
            paidAt: '2026-03-11T10:00:00Z'
        });
        const unpaid = await seed({ createdAt: '2026-02-10T10:00:00Z' });

        expect(await sortedIds({ createdFrom: '2026-02-01T00:00:00Z' })).toEqual(
            [String(mar._id), String(unpaid._id)].toSorted()
        );
        expect(await sortedIds({ createdTo: '2026-02-01T00:00:00Z' })).toEqual([String(jan._id)]);
        expect(
            await sortedIds({ paidFrom: '2026-01-01T00:00:00Z', paidTo: '2026-02-01T00:00:00Z' })
        ).toEqual([String(jan._id)]);
        // An unpaid order carries no `paidAt`, so no paid-date bound can match it.
        expect(await sortedIds({ paidFrom: '2020-01-01T00:00:00Z' })).not.toContain(
            String(unpaid._id)
        );
    });

    it('finds, for every paymentStatus and returnStatus, exactly the orders that read as it', async () => {
        const unpaid = await seed({});
        const paid = await seed({ paidAt: '2026-01-11T10:00:00Z' });
        const refunded = await seed({ paidAt: '2026-01-11T10:00:00Z' });
        await orderRepository.setProjection(String(refunded._id), {
            paymentStatus: 'refunded',
            returnStatus: 'returned'
        });
        const partial = await seed({ paidAt: '2026-01-11T10:00:00Z' });
        await orderRepository.setProjection(String(partial._id), {
            paymentStatus: 'partially_refunded',
            returnStatus: 'requested'
        });

        expect(await idsInOrder({ paymentStatus: 'unpaid' })).toEqual([String(unpaid._id)]);
        expect(await idsInOrder({ paymentStatus: 'paid' })).toEqual([String(paid._id)]);
        expect(await idsInOrder({ paymentStatus: 'refunded' })).toEqual([String(refunded._id)]);
        expect(await idsInOrder({ paymentStatus: 'partially_refunded' })).toEqual([
            String(partial._id)
        ]);
        expect(await idsInOrder({ returnStatus: 'returned' })).toEqual([String(refunded._id)]);
        expect(await sortedIds({ returnStatus: 'none' })).toEqual(
            [String(unpaid._id), String(paid._id)].toSorted()
        );
        // Both together narrow, never widen.
        expect(await idsInOrder({ paymentStatus: 'refunded', returnStatus: 'requested' })).toEqual(
            []
        );
    });

    it('sorts by paidAt and sends paidAt on the wire', async () => {
        const late = await seed({ paidAt: '2026-05-01T00:00:00Z' });
        const early = await seed({ paidAt: '2026-04-01T00:00:00Z' });

        const { items } = await orderService.search({ sort: ['paidAt'] });

        expect(items.map((item) => item.id)).toEqual([String(early._id), String(late._id)]);
        // As the HTTP layer serializes it: the wire carries an ISO string.
        const [first] = items;
        expect(JSON.stringify(first.paidAt)).toBe('"2026-04-01T00:00:00.000Z"');
    });
});
