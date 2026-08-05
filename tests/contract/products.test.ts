/**
 * Contract tests for /products.
 *
 * These assert the *shape of the wire response* against `openapi.yaml` — including
 * `additionalProperties: false`, which is what catches a field leaking into a payload.
 * Behavioural assertions (which products a role may see) live in the unit/service suites;
 * here they exist only to make sure each contract branch is actually exercised.
 */
import '../helpers/contract';
import { setupTestDb } from '../helpers/setup-test-db';
import { api, authenticateAs } from '../helpers/http';
import { createProduct } from '../helpers/factories/products';

setupTestDb();

describe('GET /products', () => {
    it('matches the contract for an anonymous caller', async () => {
        await createProduct();
        const response = await api().get('/products');

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for an admin caller', async () => {
        const { bearer } = await authenticateAs('admin');
        await createProduct();
        const response = await api().get('/products').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract when the list is empty', async () => {
        const response = await api().get('/products');

        expect(response.body.data.items).toHaveLength(0);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a paginated request', async () => {
        await Promise.all([createProduct(), createProduct(), createProduct()]);
        const response = await api().get('/products?page=1&pageSize=2');

        expect(response.body.data.items).toHaveLength(2);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /products/search', () => {
    it('matches the contract', async () => {
        await createProduct();
        const response = await api().post('/products/search').send({ page: 1, pageSize: 10 });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /products/{id}', () => {
    it('matches the contract for an existing product', async () => {
        const product = await createProduct();
        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a missing product', async () => {
        const response = await api().get('/products/65dc8a99604c307b702b5ccc');

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});
