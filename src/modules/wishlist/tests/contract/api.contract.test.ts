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
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

/**
 * An id no ObjectId can be built from.
 *
 * `Id` is a storage-neutral string in the contract, so every id-taking route makes its own
 * Mongo-shaped check. In a path it answers as an unknown id does: 404. In the body of
 * `POST /wishlist/items` it is a malformed field: 422. Both are declared responses, and a
 * declared response nothing sends is a contract nobody is holding the API to.
 */
const MALFORMED_ID = 'not-an-object-id';

/** Logs a user in and saves one product, returning both. */
const authenticateWithWishlist = async () => {
    const { bearer } = await authenticateAs('user');
    const product = await createProduct();
    const response = await api()
        .post('/wishlist/items')
        .set('Authorization', bearer)
        .send({ productId: String(product._id) });

    if (response.status !== 200)
        throw new Error(
            `wishlist setup failed: POST /wishlist/items returned ${response.status} — ${JSON.stringify(response.body)}`
        );

    return { bearer, product };
};

describe('GET /wishlist', () => {
    it('matches the contract for an empty wishlist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().get('/wishlist').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(0);
    });

    it('matches the contract for a wishlist holding items', async () => {
        const { bearer, product } = await authenticateWithWishlist();
        const response = await api().get('/wishlist').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([
            { productId: String(product._id), availability: 'in_stock' }
        ]);
    });
});

describe('POST /wishlist/items', () => {
    it('matches the contract when saving a product', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct();

        const response = await api()
            .post('/wishlist/items')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([
            { productId: String(product._id), availability: 'in_stock' }
        ]);
    });

    // A saved product is a line of the wishlist: no 201, no Location, nothing to GET.
    it('answers 200 with no Location, however the line came to be', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct();

        const response = await api()
            .post('/wishlist/items')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        expect(response.status).toBe(200);
        expect(response.headers.location).toBeUndefined();
    });

    it('is idempotent — saving what is saved answers the same 200 and the same list', async () => {
        const { bearer, product } = await authenticateWithWishlist();

        const response = await api()
            .post('/wishlist/items')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([
            { productId: String(product._id), availability: 'in_stock' }
        ]);
    });

    it('matches the error contract for a malformed product id: 422, it is a body field', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/wishlist/items')
            .set('Authorization', bearer)
            .send({ productId: MALFORMED_ID });

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a missing productId', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api().post('/wishlist/items').set('Authorization', bearer).send({});

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a product that does not exist', async () => {
        const { bearer } = await authenticateAs('user');
        const response = await api()
            .post('/wishlist/items')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID });

        expect(response.status).toBe(404);
    });
});

describe('DELETE /wishlist/items/{productId}', () => {
    it('matches the contract when removing a saved product', async () => {
        const { bearer, product } = await authenticateWithWishlist();

        const response = await api()
            .delete(`/wishlist/items/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(0);
    });

    // The move writes a basket, and every signed-in account holds one: a staff member keeps a
    // wishlist and fills a basket through it like any customer.
    it.each(['manager', 'moderator', 'admin'])(
        'moves a saved line into the basket of a %s',
        async (role) => {
            const { bearer } = await authenticateAsRole(role);
            const product = await createProduct();
            await api()
                .post('/wishlist/items')
                .set('Authorization', bearer)
                .send({ productId: String(product._id) });

            const response = await api()
                .post(`/wishlist/items/${String(product._id)}/move-to-cart`)
                .set('Authorization', bearer);
            const wishlist = await api().get('/wishlist').set('Authorization', bearer);

            expect(response.status).toBe(200);
            expect(wishlist.body.items).toHaveLength(0);
        }
    );

    it('matches the error contract for a product that was never saved', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .delete(`/wishlist/items/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a malformed product id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .delete(`/wishlist/items/${MALFORMED_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('POST /wishlist/items/{productId}/move-to-cart', () => {
    it('moves the line and the two views agree', async () => {
        const { bearer, product } = await authenticateWithWishlist();

        const response = await api()
            .post(`/wishlist/items/${String(product._id)}/move-to-cart`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(0);

        const cart = await api().get('/cart').set('Authorization', bearer);
        expect(cart.body.items).toEqual([
            {
                productId: String(product._id),
                quantity: 1,
                availability: 'in_stock',
                canIncrease: true
            }
        ]);
    });

    it('matches the error contract for a product that was never saved', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/wishlist/items/${MISSING_ID}/move-to-cart`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a malformed product id', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()
            .post(`/wishlist/items/${MALFORMED_ID}/move-to-cart`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('the wishlist URLs a line no longer has', () => {
    it('answers a GET of the line collection 405, since the wishlist is the read', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/wishlist/items').set('Authorization', bearer);

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('POST');
    });
});
