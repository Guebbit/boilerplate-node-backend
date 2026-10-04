/**
 * @module
 * Contract tests for /products: assert the *shape of the wire response* against `openapi.yaml`,
 * including `additionalProperties: false`, which catches a field leaking into a payload.
 * Behavioural assertions (which products a role may see) live in the unit/service suites — these
 * exist only to make sure each contract branch is actually exercised.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { withEnvironment } from '@tests/environment';
import { createProduct } from '@modules/products/tests/factories';
import { productRepository } from '../../repository';

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
    });

    it('matches the contract for an admin caller', async () => {
        const { bearer } = await authenticateAs('admin');
        await createProduct();
        const response = await api().get('/products').set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('matches the contract when the list is empty', async () => {
        const response = await api().get('/products');

        expect(response.body.data.items).toHaveLength(0);
    });

    it('matches the contract for a paginated request', async () => {
        await Promise.all([createProduct(), createProduct(), createProduct()]);
        const response = await api().get('/products?page=1&pageSize=2');

        expect(response.body.data.items).toHaveLength(2);
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

    // Tier A: `id` is a batch filter. `?id=` repeated validates against the widened array schema;
    // over the declared cap it's a 422, matching `PageSize.maximum`.
    it('accepts a repeated ?id=, and rejects more than 100', async () => {
        const one = await createProduct();
        const other = await createProduct();

        const repeated = await api().get(`/products?id=${String(one._id)}&id=${String(other._id)}`);
        expect(repeated.status).toBe(200);
        expect(repeated.body.data.items.map((p: { id: string }) => p.id).toSorted()).toEqual(
            [String(one._id), String(other._id)].toSorted()
        );

        const overCap = await api().get(
            `/products?${Array.from({ length: 101 }, (_, index) => `id=${index}`).join('&')}`
        );
        expect(overCap.status).toBe(422);
    });

    it('answers 422 for an empty id filter, never "everything"', async () => {
        await createProduct();
        const response = await api().get('/products?id=');

        expect(response.status).toBe(422);
    });

    it('collapses a duplicated id to one row', async () => {
        const one = await createProduct();

        const response = await api().get(`/products?id=${String(one._id)}&id=${String(one._id)}`);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
    });

    // `$in` casts every element — one malformed id anywhere in the batch is a 422 about the
    // request, not a page that silently drops it.
    it('rejects a batch with one malformed id, valid ids included', async () => {
        const one = await createProduct();

        const response = await api().get(`/products?id=${String(one._id)}&id=not-an-object-id`);

        expect(response.status).toBe(422);
    });

    // The shared `Text` schema (`shared/contracts/openapi.root.yaml`) caps free-text search at
    // 200 chars — an anonymous caller could otherwise hand Mongo an unbounded pattern. Every
    // search endpoint inherits this through `$ref`.
    it('rejects a search text over 200 characters, instead of forwarding it to Mongo', async () => {
        const response = await api().get(`/products?text=${'a'.repeat(201)}`);

        expect(response.status).toBe(422);
    });
});

describe('POST /products/search', () => {
    it('matches the contract', async () => {
        await createProduct();
        const response = await api().post('/products/search').send({ page: 1, pageSize: 10 });

        expect(response.status).toBe(200);
    });

    // `title`, `category` and `tag` build the response-cache key before the controller runs, so an
    // unbounded one would let an anonymous caller mint a key as long as the body limit allows.
    it.each(['title', 'category', 'tag'])('rejects a %s over 200 characters', async (field) => {
        const body = await api()
            .post('/products/search')
            .send({ [field]: 'a'.repeat(201) });
        const query = await api().get(`/products?${field}=${'a'.repeat(201)}`);

        expect(body.status).toBe(422);
        expect(query.status).toBe(422);
    });

    it('refuses a body nested past the depth limit, never caching it and never a 500', async () => {
        // 100,000 bytes of `[[[…]]]`: nested deeper than any walker's stack.
        const nested = `{"title":${'['.repeat(49_990)}${']'.repeat(49_990)}}`;
        const response = await api()
            .post('/products/search')
            .set('Content-Type', 'application/json')
            .send(nested);

        // The depth guard refuses it before the cache key is ever built.
        expect(response.status).toBe(400);
    });
});

const titlesOf = (response: { body: { data: { items: { title: string }[] } } }) =>
    response.body.data.items.map((product) => product.title);

describe('sort — GET /products?sort= and POST /products/search { sort }', () => {
    beforeEach(async () => {
        await createProduct({ title: 'banana', price: 5 });
        await createProduct({ title: 'Apple', price: 9 });
        await createProduct({ title: 'cherry', price: 5 });
    });

    it('orders by one field, descending with a "-" prefix', async () => {
        const up = await api().get('/products?sort=price,title');
        const down = await api().get('/products?sort=-price');

        expect(titlesOf(up)).toEqual(['banana', 'cherry', 'Apple']);
        expect(titlesOf(down)[0]).toBe('Apple');
    });

    it('sorts text case-insensitively, so "Apple" files before "banana"', async () => {
        const response = await api().get('/products?sort=title');

        expect(titlesOf(response)).toEqual(['Apple', 'banana', 'cherry']);
    });

    it('ranks earlier entries first', async () => {
        const response = await api().get('/products?sort=-price,-title');

        expect(titlesOf(response)).toEqual(['Apple', 'cherry', 'banana']);
    });

    it('sorts the whole result, not the page held: page 2 continues page 1', async () => {
        const first = await api().get('/products?sort=title&pageSize=2&page=1');
        const second = await api().get('/products?sort=title&pageSize=2&page=2');

        expect([...titlesOf(first), ...titlesOf(second)]).toEqual(['Apple', 'banana', 'cherry']);
    });

    it('accepts the same field in the search body, as an array', async () => {
        const response = await api()
            .post('/products/search')
            .send({ sort: ['-title'] });

        expect(response.status).toBe(200);
        expect(titlesOf(response)).toEqual(['cherry', 'banana', 'Apple']);
    });

    it('accepts a repeated key as well as the CSV', async () => {
        const response = await api().get('/products?sort=price&sort=title');

        expect(titlesOf(response)).toEqual(['banana', 'cherry', 'Apple']);
    });

    it('treats a blank sort as absent, and keeps the newest-first default', async () => {
        const blank = await api().get('/products?sort=');
        const none = await api().get('/products');

        expect(blank.status).toBe(200);
        expect(titlesOf(blank)).toEqual(titlesOf(none));
    });

    it.each(['description', 'password', 'price,price,title,createdAt', '--price'])(
        'answers 422 for a sort outside the whitelist: %s',
        async (sort) => {
            const response = await api().get(`/products?sort=${sort}`);

            expect(response.status).toBe(422);
        }
    );

    it('answers 422 for a body sort outside the whitelist', async () => {
        const response = await api()
            .post('/products/search')
            .send({ sort: ['imageUrl'] });

        expect(response.status).toBe(422);
    });

    it('does not let two different sorts share one cached answer', async () => {
        const up = await api().get('/products?sort=price,title');
        const down = await api().get('/products?sort=-price,-title');

        expect(titlesOf(up)).not.toEqual(titlesOf(down));
    });
});

describe('GET /products/{id}', () => {
    it('matches the contract for an existing product', async () => {
        const product = await createProduct();
        const response = await api().get(`/products/${String(product._id)}`);

        expect(response.status).toBe(200);
    });

    it('matches the error contract for a missing product', async () => {
        const response = await api().get('/products/65dc8a99604c307b702b5ccc');

        expect(response.status).toBe(404);
    });

    // Every money-carrying resource carries its own currency — never a hard-coded EUR on
    // the frontend's side.
    it('reads the live NODE_DEFAULT_CURRENCY, not a fixed default', () =>
        withEnvironment('NODE_DEFAULT_CURRENCY', 'GBP', async () => {
            const product = await createProduct();
            const response = await api().get(`/products/${String(product._id)}`);

            expect(response.body.data.currency).toBe('GBP');
        }));
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
    });

    it('soft-deletes for hardDelete=false rather than destroying the record', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}?hardDelete=false`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await stored(String(product._id))).not.toBeNull();
    });

    it('hard-deletes for hardDelete=true', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}?hardDelete=true`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(await stored(String(product._id))).toBeNull();
    });

    it('rejects a value that is not a boolean rather than guessing at it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete(`/products/${String(product._id)}?hardDelete=maybe`)
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
        expect(await stored(String(product._id))).not.toBeNull();
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
    });

    it('keeps its own cache header over the no-store default', async () => {
        const response = await api().get('/products/categories');

        expect(response.headers['cache-control']).toMatch(/^public, max-age=\d+/);
    });

    it('matches the contract for an empty catalogue', async () => {
        const response = await api().get('/products/categories');

        expect(response.status).toBe(200);
        expect(response.body.data.categories).toEqual([]);
    });
});

describe('GET /products/settings', () => {
    it('reports the configured shop currency, with no credential', () =>
        withEnvironment('NODE_DEFAULT_CURRENCY', 'JPY', async () => {
            const response = await api().get('/products/settings');

            expect(response.status).toBe(200);
            expect(response.body.data).toEqual({ currency: 'JPY' });
        }));
});

/**
 * DELETE is one-way and safe to retry (RFC 9110 §9.2.2); undoing a soft delete is its own verb.
 */
describe('POST /products/{id}/restore', () => {
    it('brings a soft-deleted product back, matching the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct({ deletedAt: new Date() });

        const response = await api()
            .post(`/products/${String(product._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect((await stored(String(product._id)))!.deletedAt).toBeUndefined();
    });

    it('answers 409 for a product that is not deleted', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .post(`/products/${String(product._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
    });

    it('is refused to a caller who may not delete products', async () => {
        const { bearer } = await authenticateAs('user');
        const product = await createProduct({ deletedAt: new Date() });

        const response = await api()
            .post(`/products/${String(product._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
    });
});

describe('DELETE /products/{id} repeated', () => {
    it('leaves the product deleted — a retried DELETE never restores it', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${String(product._id)}`;

        await api().delete(path).set('Authorization', bearer);
        const retried = await api().delete(path).set('Authorization', bearer);

        expect(retried.status).toBe(200);
        expect((await stored(String(product._id)))!.deletedAt).toBeInstanceOf(Date);
    });
});

/** The ids on one page of a product listing. */
const idsOf = (body: { data: { items: { id: string }[] } }) =>
    body.data.items.map((item) => item.id);

describe('GET /products?deleted=', () => {
    it('lists only soft-deleted products for true, and only live ones for false', async () => {
        const { bearer } = await authenticateAs('admin');
        const live = await createProduct();
        const gone = await createProduct({ deletedAt: new Date() });

        const deleted = await api().get('/products?deleted=true').set('Authorization', bearer);
        const kept = await api().get('/products?deleted=false').set('Authorization', bearer);

        expect(idsOf(deleted.body)).toEqual([String(gone._id)]);
        expect(idsOf(kept.body)).toEqual([String(live._id)]);
    });
});

/** The body-addressed twin of `DELETE /products/{id}`. */
describe('DELETE /products — the id in the body', () => {
    it('matches the contract for a soft delete', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();

        const response = await api()
            .delete('/products')
            .set('Authorization', bearer)
            .send({ id: String(product._id) });

        expect(response.status).toBe(200);
        const stored = await productRepository.findById(String(product._id));
        expect(stored?.deletedAt).toBeInstanceOf(Date);
    });

    it('matches the error contract for an id nobody holds', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .delete('/products')
            .set('Authorization', bearer)
            .send({ id: '65dc8a99604c307b702b5ccc' });

        expect(response.status).toBe(404);
    });
});

/*
 * The catalogue reads are public; every write owes an anonymous caller the 401 the spec declares,
 * and a customer the 403.
 */
describe.each([
    ['post', '/products'],
    ['delete', '/products/65dc8a99604c307b702b5ccc'],
    ['patch', '/products/65dc8a99604c307b702b5ccc'],
    ['post', '/products/65dc8a99604c307b702b5ccc/restore'],
    ['delete', '/products/65dc8a99604c307b702b5ccc/hard'],
    ['get', '/products/65dc8a99604c307b702b5ccc/admin']
] as const)('%s %s — the refusals', (method, path) => {
    it('matches the error contract with no credentials', async () => {
        const response = await api()[method](path);

        expect(response.status).toBe(401);
    });

    it('matches the error contract for a customer', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api()[method](path).set('Authorization', bearer);

        expect(response.status).toBe(403);
    });
});
