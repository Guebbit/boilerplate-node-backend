/**
 * Contract tests for /cart.
 *
 * Every cart route requires authentication and every one of them answers with the same
 * `CartResponseEnvelope`, which makes this resource the easiest place for a serialization drift
 * to hide: six endpoints, one shape, and until now not one of them crossed HTTP in a test.
 *
 * The cart is built through the API rather than through a factory on purpose. A cart lives
 * *inside* the user document, so a hand-written fixture would be asserting on a shape the
 * application never produces.
 *
 * Behavioural rules (whose cart, which products) belong to the service suites; the assertions
 * here exist to make sure each contract branch is actually reached.
 */
import '../helpers/contract';
import { setupTestDb } from '../helpers/setup-test-db';
import { api, authenticateAs } from '../helpers/http';
import { createProduct } from '../helpers/factories/products';

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

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post('/cart/checkout');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
