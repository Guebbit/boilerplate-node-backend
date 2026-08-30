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
import { createProduct } from '@modules/products/tests/fixtures';
import { productRepository } from '@modules/products';

setupTestDb();

describe('GET /products — the filters it now publishes', () => {
    /*
     * `title` and `active` were applied by the repository and named nowhere in the contract.
     * `title` is the one of the pair a stranger can use; `active` is admin-effective, because a
     * stranger's visibility scope pins `active: true` and the two clauses contradict rather than
     * revealing the unlisted catalogue — asserted, so publishing the filter cannot quietly become
     * a way to read past the scope.
     */
    it('narrows by title, and refuses to show a stranger past the scope', async () => {
        await createProduct({ title: 'Walnut desk' });
        await createProduct({ title: 'Oak stool' });
        await createProduct({ title: 'Walnut prototype', active: false });

        const { bearer } = await authenticateAs('admin');
        const staff = await api().get('/products?title=Walnut').set('Authorization', bearer);
        expect(staff.status).toBe(200);
        expect(staff.body.data.items.map((p: { title: string }) => p.title).toSorted()).toEqual([
            'Walnut desk',
            'Walnut prototype'
        ]);

        const stranger = await api().get('/products?title=Walnut');
        expect(stranger.status).toBe(200);
        expect(stranger.body.data.items.map((p: { title: string }) => p.title)).toEqual([
            'Walnut desk'
        ]);

        /*
         * The invariant, asserted rather than the page shape: a stranger asking for the unlisted
         * rows does not get them. HOW that is achieved differs by backend — here the caller's scope
         * is merged last and overwrites the filter, so the answer is the active catalogue; the PHP
         * twin adds both clauses and answers an empty page. Either is safe, and pinning one would
         * make this a test of the merge order rather than of the guarantee.
         */
        const asking = await api().get('/products?active=false');
        expect(asking.status).toBe(200);
        expect(asking.body.data.items.map((p: { title: string }) => p.title)).not.toContain(
            'Walnut prototype'
        );
    });
});

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

    /**
     * Contradictory sources: OR, not precedence. `false` is the default, so it is a value nobody
     * normally types — a `false` meaning "unset" must not outrank a `true` someone spelled just
     * because it rode the higher-precedence transport.
     */
    describe('hardDelete stated twice', () => {
        it.each([
            ['query false, body true', 'false', true],
            ['query true, body false', 'true', false]
        ])('hard-deletes for %s', async (_case, query, body) => {
            const { bearer } = await authenticateAs('admin');
            const product = await createProduct();

            const response = await api()
                .delete(`/products/${String(product._id)}?hardDelete=${query}`)
                .set('Authorization', bearer)
                .send({ hardDelete: body });

            expect(response.status).toBe(200);
            expect(await stored(String(product._id))).toBeNull();
            expect(response).toSatisfyApiSpec();
        });

        // OR must not become a way to launder a malformed value into a destroy.
        it('still rejects an undecodable value when the other source says true', async () => {
            const { bearer } = await authenticateAs('admin');
            const product = await createProduct();

            const response = await api()
                .delete(`/products/${String(product._id)}?hardDelete=maybe`)
                .set('Authorization', bearer)
                .send({ hardDelete: true });

            expect(response.status).toBe(422);
            expect(await stored(String(product._id))).not.toBeNull();
            expect(response).toSatisfyApiSpec();
        });
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
