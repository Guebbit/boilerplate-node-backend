/**
 * Contract tests for /inventory.
 *
 * Both routes are staff's; what these pin is each contract branch reached over HTTP — the
 * ledger read (empty and populated), the restock's 200/404/422, and the 403 for a customer.
 * The ledger's sourcing rules live in the unit suite.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factory';

setupTestDb();

/** A valid ObjectId that is guaranteed not to exist — the 404 branch, not the 422 one. */
const MISSING_ID = '65dc8a99604c307b702b5ccc';

describe('GET /inventory/movements', () => {
    it('matches the contract for an empty ledger', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api().get('/inventory/movements').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a ledger holding rows, narrowed by product', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        await api()
            .post('/inventory/restock')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 5 });

        const response = await api()
            .get(`/inventory/movements?productId=${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0].reason).toBe('restock');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().get('/inventory/movements').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /inventory/restock', () => {
    it('matches the contract and answers the shelf after the delivery', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ stock: 3 });

        const response = await api()
            .post('/inventory/restock')
            .set('Authorization', bearer)
            .send({ productId: String(product._id), quantity: 7 });

        expect(response.status).toBe(200);
        expect(response.body.data.stock).toBe(10);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an unknown product', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/inventory/restock')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID, quantity: 7 });

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an invalid body', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post('/inventory/restock')
            .set('Authorization', bearer)
            .send({ quantity: 0 });

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api()
            .post('/inventory/restock')
            .send({ productId: MISSING_ID, quantity: 1 });

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
