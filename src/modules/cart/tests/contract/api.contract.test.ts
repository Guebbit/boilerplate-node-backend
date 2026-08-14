/**
 * Contract tests for /cart.
 *
 * Every cart route requires authentication and every one of them answers with the same
 * `CartResponseEnvelope`, which makes this resource the easiest place for a serialization drift
 * to hide: six endpoints, one shape, and until now not one of them crossed HTTP in a test.
 *
 * The cart is built through the API rather than through a factory on purpose. `CartResponse` is a
 * view computed from the stored lines and the products they price, not a serialization of the cart
 * document, so a hand-written fixture would be asserting on a shape the application never produces.
 *
 * Behavioural rules (whose cart, which products) belong to the service suites; the assertions
 * here exist to make sure each contract branch is actually reached.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factory';
import { createOrder } from '@modules/orders/tests/factory';
import { createUser } from '@modules/users/tests/factory';
import type { OrderDocumentItem } from '@modules/orders';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

/** Logs a user in and puts one product in their cart, returning both. */
const authenticateWithCart = async (quantity = 2) => {
    const { bearer } = await authenticateAs('user');
    const product = await createProduct();
    const response = await api()
        .post('/cart')
        .set('Authorization', bearer)
        .send({ productId: String(product._id), quantity });

    if (response.status !== 200)
        throw new Error(
            `cart setup failed: POST /cart returned ${response.status} — ${JSON.stringify(response.body)}`
        );

    return { bearer, product };
};

describe('GET /cart', () => {
    it('matches the contract for an empty cart', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/cart').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a cart holding items', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api().get('/cart').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/cart');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /cart', () => {
    it('matches the contract when adding an item', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct();
        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 3 });

        expect(response.status).toBe(200);
        expect(response.body.data.summary.totalQuantity).toBe(3);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: 'not-an-id' });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a product that does not exist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID, quantity: 1 });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post('/cart').send({ productId: MISSING_ID, quantity: 1 });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /cart', () => {
    it('matches the contract when clearing the whole cart', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api().delete('/cart').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract when removing one product through the body', async () => {
        const { bearer, product } = await authenticateWithCart();
        const response = await api()
            .delete('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().delete('/cart');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('PUT /cart/{productId}', () => {
    it('matches the contract when setting a quantity', async () => {
        const { bearer, product } = await authenticateWithCart();
        const response = await api()
            .put(`/cart/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ quantity: 5 });

        expect(response.status).toBe(200);
        expect(response.body.data.summary.totalQuantity).toBe(5);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer, product } = await authenticateWithCart();
        const response = await api()
            .put(`/cart/${String(product._id)}`)
            .set('Authorization', bearer)
            .send({ quantity: 0 });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().put(`/cart/${MISSING_ID}`).send({ quantity: 1 });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /cart/{productId}', () => {
    it('matches the contract when removing an item', async () => {
        const { bearer, product } = await authenticateWithCart();
        const response = await api()
            .delete(`/cart/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().delete(`/cart/${MISSING_ID}`);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /cart/summary', () => {
    it('matches the contract for an empty cart', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/cart/summary').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a cart holding items', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api().get('/cart/summary').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.itemsCount).toBe(1);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/cart/summary');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /cart/checkout', () => {
    it('matches the contract when the cart becomes an order', async () => {
        const { bearer } = await authenticateWithCart();
        const response = await api().post('/cart/checkout').set('Authorization', bearer);

        expect(response.status).toBe(201);
        expect(response).toSatisfyApiSpec();
    });

    it('empties the cart on success', async () => {
        const { bearer } = await authenticateWithCart();
        await api().post('/cart/checkout').set('Authorization', bearer);
        const response = await api().get('/cart').set('Authorization', bearer);

        expect(response.body.data.items).toHaveLength(0);
    });

    // 409, not 422: an empty cart is a state conflict, not a malformed request. The spec did not
    // declare it until this suite was written — the implementation has answered 409 all along.
    it('matches the error contract for an empty cart', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().post('/cart/checkout').set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when a line exceeds the shelf', async () => {
        const { bearer } = await authenticateAs('user');
        const scarce = await createProduct({ stock: 1 });
        await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(scarce._id), quantity: 2 });

        const response = await api().post('/cart/checkout').set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('CART_INSUFFICIENT_STOCK');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post('/cart/checkout');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /cart/reorder/{orderId}', () => {
    it("refills the cart from the caller's own order, quantities included", async () => {
        const { bearer, user } = await authenticateAs('user');
        const keyboard = await createProduct({ title: 'Keyboard' });
        const mouse = await createProduct({ title: 'Mouse' });
        const order = await createOrder(user, [
            { product: keyboard, quantity: 2 } as unknown as OrderDocumentItem,
            { product: mouse, quantity: 1 } as unknown as OrderDocumentItem
        ]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        // Ids, not counts: the cart must hold exactly the order's products.
        const items: { productId: string; quantity: number }[] = response.body.data.items;
        expect(items.map(({ productId }) => productId).toSorted()).toEqual(
            [String(keyboard._id), String(mouse._id)].toSorted()
        );
        expect(response.body.data.summary.totalQuantity).toBe(3);
        expect(response).toSatisfyApiSpec();
    });

    it('adds on top of what the cart already holds', async () => {
        const { bearer, user } = await authenticateAs('user');
        const product = await createProduct();
        const seeded = await api()
            .post('/cart')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 2 });
        expect(seeded.status).toBe(200);

        // The same product arrives again via a reorder of an old order holding 3 of it.
        const order = await createOrder(user, [
            { product, quantity: 3 } as unknown as OrderDocumentItem
        ]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.summary.totalQuantity).toBe(5);
        expect(response).toSatisfyApiSpec();
    });

    it('skips products that have left the public catalogue and lands the rest', async () => {
        const { bearer, user } = await authenticateAs('user');
        const alive = await createProduct({ title: 'Alive' });
        const retired = await createProduct({ title: 'Retired', active: false });
        const order = await createOrder(user, [
            { product: alive, quantity: 1 } as unknown as OrderDocumentItem,
            { product: retired, quantity: 4 } as unknown as OrderDocumentItem
        ]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        const items: { productId: string }[] = response.body.data.items;
        expect(items.map(({ productId }) => productId)).toEqual([String(alive._id)]);
        expect(response).toSatisfyApiSpec();
    });

    it('answers 409 when nothing on the order is still available', async () => {
        const { bearer, user } = await authenticateAs('user');
        const retired = await createProduct({ title: 'Retired', active: false });
        const order = await createOrder(user, [
            { product: retired, quantity: 1 } as unknown as OrderDocumentItem
        ]);

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('REORDER_UNAVAILABLE');
        expect(response).toSatisfyApiSpec();
    });

    it("answers 404 for another user's order — no existence leak", async () => {
        const owner = await createUser({ email: 'owner@example.com', username: 'owner' });
        const product = await createProduct();
        const order = await createOrder(owner, [
            { product, quantity: 1 } as unknown as OrderDocumentItem
        ]);
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/cart/reorder/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a malformed order id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().post('/cart/reorder/not-an-id').set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post(`/cart/reorder/${MISSING_ID}`);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
