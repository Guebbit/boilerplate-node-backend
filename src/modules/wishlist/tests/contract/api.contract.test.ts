/**
 * Contract tests for /wishlist.
 *
 * Every route requires authentication and answers the same `WishlistResponseEnvelope`, the same
 * single-shape surface the cart has — so like the cart's, these assertions exist to make sure
 * each contract branch is actually reached over HTTP. Behavioural rules live in the unit suite.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factory';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

/** Logs a user in and saves one product, returning both. */
const authenticateWithWishlist = async () => {
    const { bearer } = await authenticateAs('user');
    const product = await createProduct();
    const response = await api()
        .post('/wishlist')
        .set('Authorization', bearer)
        .send({ productId: String(product._id) });

    if (response.status !== 200)
        throw new Error(
            `wishlist setup failed: POST /wishlist returned ${response.status} — ${JSON.stringify(response.body)}`
        );

    return { bearer, product };
};

describe('GET /wishlist', () => {
    it('matches the contract for an empty wishlist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/wishlist').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a wishlist holding items', async () => {
        const { bearer, product } = await authenticateWithWishlist();
        const response = await api().get('/wishlist').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([{ productId: String(product._id) }]);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/wishlist');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /wishlist', () => {
    it('matches the contract when saving a product', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct();

        const response = await api()
            .post('/wishlist')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([{ productId: String(product._id) }]);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().post('/wishlist').set('Authorization', bearer).send({});

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a product that does not exist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/wishlist')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post('/wishlist').send({ productId: MISSING_ID });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /wishlist/{productId}', () => {
    it('matches the contract when removing a saved product', async () => {
        const { bearer, product } = await authenticateWithWishlist();

        const response = await api()
            .delete(`/wishlist/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a product that was never saved', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().delete(`/wishlist/${MISSING_ID}`).set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().delete(`/wishlist/${MISSING_ID}`);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /wishlist/{productId}/move-to-cart', () => {
    it('moves the line and the two views agree', async () => {
        const { bearer, product } = await authenticateWithWishlist();

        const response = await api()
            .post(`/wishlist/${String(product._id)}/move-to-cart`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();

        const cart = await api().get('/cart').set('Authorization', bearer);
        expect(cart.body.data.items).toEqual([{ productId: String(product._id), quantity: 1 }]);
    });

    it('matches the error contract for a product that was never saved', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/wishlist/${MISSING_ID}/move-to-cart`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post(`/wishlist/${MISSING_ID}/move-to-cart`);

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
