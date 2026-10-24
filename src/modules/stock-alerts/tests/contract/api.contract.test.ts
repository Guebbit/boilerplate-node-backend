/**
 * @module
 * Contract tests for /stock-alerts.
 *
 * Every route answers the same `StockAlertsResponseEnvelope`, so these exist to make each declared
 * branch (200, 401, 404, 409) actually reached over HTTP and checked against the spec. The wiring
 * to the inventory signal is `tests/integration/stock-alerts.test.ts`'s business.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { MISSING_ID } from '@tests/ids';

setupTestDb();

/** A sold-out product: the one kind a request can be made for. */
const soldOut = () => createProduct({ onHand: 0 }).then((product) => String(product._id));

describe('GET /stock-alerts', () => {
    it('matches the contract for a caller with no open request', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api().get('/stock-alerts').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    it('matches the contract for a caller with one', async () => {
        const { bearer } = await authenticateAsRole('customer');
        const productId = await soldOut();
        await api().post('/stock-alerts').set('Authorization', bearer).send({ productId });

        const response = await api().get('/stock-alerts').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toMatchObject([{ productId }]);
    });

    it('refuses a caller who is not signed in', async () => {
        const response = await api().get('/stock-alerts');

        expect(response.status).toBe(401);
    });
});

describe('POST /stock-alerts', () => {
    it('matches the contract when asking about a sold-out product, twice alike', async () => {
        const { bearer } = await authenticateAsRole('customer');
        const productId = await soldOut();

        const first = await api()
            .post('/stock-alerts')
            .set('Authorization', bearer)
            .send({ productId });
        const second = await api()
            .post('/stock-alerts')
            .set('Authorization', bearer)
            .send({ productId });

        expect([first.status, second.status]).toEqual([200, 200]);
        expect(second.body.data.items).toHaveLength(1);
    });

    it('matches the error contract while the product can be ordered now: 409 with its code', async () => {
        const { bearer } = await authenticateAsRole('customer');
        const product = await createProduct({ onHand: 5 });

        const response = await api()
            .post('/stock-alerts')
            .set('Authorization', bearer)
            .send({ productId: String(product._id) });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('STOCK_ALERT_PRODUCT_BUYABLE');
    });

    it('matches the error contract for a product that does not exist', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .post('/stock-alerts')
            .set('Authorization', bearer)
            .send({ productId: MISSING_ID });

        expect(response.status).toBe(404);
    });

    it('matches the error contract for a malformed or missing productId: 422', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const malformed = await api()
            .post('/stock-alerts')
            .set('Authorization', bearer)
            .send({ productId: 'not-an-object-id' });
        const missing = await api().post('/stock-alerts').set('Authorization', bearer).send({});

        expect([malformed.status, missing.status]).toEqual([422, 422]);
    });

    it('refuses a caller who is not signed in', async () => {
        const response = await api().post('/stock-alerts').send({ productId: MISSING_ID });

        expect(response.status).toBe(401);
    });

    it('answers a POST on the old product URL 405, naming the one method the URL keeps', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .post(`/stock-alerts/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(405);
        expect(response.headers.allow).toBe('DELETE');
    });
});

describe('DELETE /stock-alerts/{productId}', () => {
    it('matches the contract when cancelling the caller’s own request', async () => {
        const { bearer } = await authenticateAsRole('customer');
        const productId = await soldOut();
        await api().post('/stock-alerts').set('Authorization', bearer).send({ productId });

        const response = await api()
            .delete(`/stock-alerts/${productId}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toEqual([]);
    });

    it('matches the error contract for a request the caller does not hold', async () => {
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .delete(`/stock-alerts/${MISSING_ID}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('refuses a caller who is not signed in', async () => {
        const response = await api().delete(`/stock-alerts/${MISSING_ID}`);

        expect(response.status).toBe(401);
    });
});
