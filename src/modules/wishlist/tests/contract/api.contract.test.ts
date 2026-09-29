/**
 * @module
 * Contract tests for /wishlist.
 *
 * Every route requires authentication and answers the same `WishlistResponseEnvelope`, the same
 * single-shape surface the cart has — so like the cart's, these assertions exist to make sure
 * each contract branch is actually reached over HTTP. Behavioural rules live in the unit suite.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

/**
 * An id no ObjectId can be built from — the 422 branch.
 *
 * `Id` is a plain string in the contract, so every id-taking route makes its own Mongo-shaped
 * check and answers 422 for a malformed one. Each of those is a declared response, and a
 * declared response nothing sends is a contract nobody is holding the API to.
 */
const MALFORMED_ID = 'not-an-object-id';

/** Logs a user in and saves one product, returning both. */
const authenticateWithWishlist = async () => {
    const { bearer } = await authenticateAs('user');
    const product = await createProduct();
    const response = await api()
        .put(`/wishlist/${String(product._id)}`)
        .set('Authorization', bearer);

    if (response.status !== 200)
        throw new Error(
            `wishlist setup failed: PUT /wishlist/{productId} returned ${response.status} — ${JSON.stringify(response.body)}`
        );

    return { bearer, product };
};

describe('GET /wishlist', () => {
    it('matches the contract for an empty wishlist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/wishlist').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
    });

    it('matches the contract for a wishlist holding items', async () => {
        const { bearer, product } = await authenticateWithWishlist();
        const response = await api().get('/wishlist').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([{ productId: String(product._id) }]);
    });
});

describe('PUT /wishlist/{productId}', () => {
    it('matches the contract when saving a product', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct();

        const response = await api()
            .put(`/wishlist/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([{ productId: String(product._id) }]);
    });

    // RFC 9110 §9.3.4: the URI is the whole statement, so sending it twice leaves the same state.
    it('is idempotent — saving what is saved answers the same 200 and the same list', async () => {
        const { bearer, product } = await authenticateWithWishlist();

        const response = await api()
            .put(`/wishlist/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([{ productId: String(product._id) }]);
    });

    it('matches the error contract for a malformed product id', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().put(`/wishlist/${MALFORMED_ID}`).set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a product that does not exist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().put(`/wishlist/${MISSING_ID}`).set('Authorization', bearer);

        expect(response.status).toBe(404);
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
    });

    it('matches the error contract for a product that was never saved', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().delete(`/wishlist/${MISSING_ID}`).set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a malformed product id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .delete(`/wishlist/${MALFORMED_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
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

        const cart = await api().get('/cart').set('Authorization', bearer);
        expect(cart.body.data.items).toEqual([{ productId: String(product._id), quantity: 1 }]);
    });

    it('matches the error contract for a product that was never saved', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/wishlist/${MISSING_ID}/move-to-cart`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a malformed product id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/wishlist/${MALFORMED_ID}/move-to-cart`)
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });
});
