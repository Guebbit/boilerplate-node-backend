/**
 * Contract tests for /products.
 *
 * These assert the *shape of the wire response* against `openapi.yaml` — including
 * `additionalProperties: false`, which is what catches a field leaking into a payload.
 * Behavioural assertions (which products a role may see) live in the unit/service suites;
 * here they exist only to make sure each contract branch is actually exercised.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factory';
import { productRepository } from '@modules/products';

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

    // openapi.yaml declares `minimum: 1` / `maximum: 100` on these; an endpoint that quietly
    // rewrote an out-of-range request instead of rejecting it was advertising a limit it never
    // applied. Every search endpoint now answers the same way — see @infrastructure/http/schemas.
    it.each(['pageSize=500', 'page=0', 'page=abc', 'page=1.5'])(
        'rejects out-of-range pagination (%s)',
        async (queryString) => {
            const response = await api().get(`/products?${queryString}`);

            expect(response.status).toBe(422);
            expect(response.body.success).toBe(false);
            expect(response).toSatisfyApiSpec();
        }
    );

    // A blank value is what a form submits for an untouched field, not an attempt to set one.
    it('treats blank pagination as absent rather than invalid', async () => {
        await createProduct();
        const response = await api().get('/products?page=&pageSize=');

        expect(response.status).toBe(200);
        expect(response.body.data.meta.page).toBe(1);
        expect(response.body.data.meta.pageSize).toBe(10);
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

/** Reads the row straight from the collection, so a soft-deleted product is still visible. */
const stored = (id: string) => productRepository.findByIdRaw(id);

/**
 * `hardDelete` is a boolean the endpoint accepts three ways — query, body, or the `/hard` path
 * form. The value cases matter more than the shape here: read as *presence*, `?hardDelete=false`
 * permanently deletes the product, because the string 'false' is truthy.
 */
describe('DELETE /products/{id}', () => {
    it('soft-deletes when nothing asks otherwise', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await stored(String(product._id))).not.toBeNull();
        expect(response).toSatisfyApiSpec();
    });

    it('soft-deletes for hardDelete=false rather than destroying the record', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}?hardDelete=false`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await stored(String(product._id))).not.toBeNull();
        expect(response).toSatisfyApiSpec();
    });

    it('hard-deletes for hardDelete=true', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}?hardDelete=true`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await stored(String(product._id))).toBeNull();
        expect(response).toSatisfyApiSpec();
    });

    it('rejects a value that is not a boolean rather than guessing at it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}?hardDelete=maybe`)
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(await stored(String(product._id))).not.toBeNull();
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /products/{id}/hard', () => {
    it('is the same operation with the flag spelled in the path', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}/hard`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await stored(String(product._id))).toBeNull();
        expect(response).toSatisfyApiSpec();
    });

    // The URL the caller aimed at is the more explicit statement of intent.
    it('wins over a query parameter that contradicts it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}/hard?hardDelete=false`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await stored(String(product._id))).toBeNull();
    });
});

describe('GET /products/categories', () => {
    it('matches the contract, and only counts the public catalogue', async () => {
        await createProduct({ categories: ['pets'], tags: ['cute'] });
        await createProduct({ categories: ['secret'], tags: [], active: false });

        const response = await api().get('/products/categories');

        expect(response.status).toBe(200);
        expect(response.body.data.categories).toEqual([{ name: 'pets', count: 1 }]);
        expect(response.body.data.tags).toEqual([{ name: 'cute', count: 1 }]);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for an empty catalogue', async () => {
        const response = await api().get('/products/categories');

        expect(response.status).toBe(200);
        expect(response.body.data.categories).toEqual([]);
        expect(response).toSatisfyApiSpec();
    });
});
