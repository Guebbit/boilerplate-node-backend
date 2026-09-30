/**
 * Conditional writes (RFC 9110 §13.1.1): `ETag` on a versioned row's read, optional `If-Match` on
 * its PUT/PATCH/DELETE, 412 when the row moved since the caller read it.
 *
 * Driven through the real app because the property spans four layers — the item controller that
 * stamps the tag, the update/delete controllers that open the precondition, the repository that
 * checks and fences it, and the error interpreter that answers 412. A unit test of any one of
 * them cannot say the caller's stale edit actually did not land.
 *
 * Versioned today: products, users, orders and the caller's own account. The version is
 * `updatedAt` (see `src/infrastructure/persistence/versioning.ts`).
 */
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import { createOrder, toOrderItem, readOrder } from '@modules/orders/tests/factories';
import { productModel } from '@modules/products/model';
import { userModel } from '@modules/users/model';
import { givenLocale } from '@modules/locales/tests/factories';
import { registerModules } from '@kernel/registry';
import localesModule from '@modules/locales/module';
import productsModule from '@modules/products/module';

setupTestDb();

beforeAll(() => registerModules([localesModule, productsModule]));

/** What one versioned resource needs to be driven the same way as the others. */
interface Resource {
    name: string;
    /** Seeds a row: the path that writes it, the path that reads it, the caller, and the row's id. */
    seed: () => Promise<{ path: string; readPath: string; bearer: string; id: string }>;
    /** A body the resource accepts on PATCH; `n` makes two edits differ. */
    edit: (n: number) => Record<string, unknown>;
    /** What `stored` reads back once edit `n` has landed. */
    expected: (n: number) => unknown;
    /** Reads back the one field `edit` writes, by row id. */
    stored: (id: string) => Promise<unknown>;
}

/** The four versioned resources. Each edit touches one field no lifecycle rule guards. */
const RESOURCES: Resource[] = [
    {
        name: 'a product',
        seed: async () => {
            const { bearer } = await authenticateAs('admin');
            const product = await createProduct();
            const path = `/products/${product.id}`;
            return { path, readPath: path, bearer, id: product.id };
        },
        edit: (n) => ({ tags: [`edit-${n.toString()}`] }),
        expected: (n) => `edit-${n.toString()}`,
        stored: (id) => productModel.findById(id).then((row) => row?.tags?.join(','))
    },
    {
        name: 'a user',
        seed: async () => {
            const { bearer } = await authenticateAs('admin');
            const target = await createUser({ email: 'target@example.com', username: 'target' });
            const id = String(target._id);
            return { path: `/users/${id}`, readPath: `/users/${id}`, bearer, id };
        },
        edit: (n) => ({ username: `edited-${n.toString()}` }),
        expected: (n) => `edited-${n.toString()}`,
        stored: (id) => userModel.findById(id).then((row) => row?.username)
    },
    {
        name: 'an order',
        seed: async () => {
            const { bearer, user } = await authenticateAs('admin');
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);
            const id = String(order._id);
            return { path: `/orders/${id}`, readPath: `/orders/${id}`, bearer, id };
        },
        edit: (n) => ({ email: `edit-${n.toString()}@example.com` }),
        expected: (n) => `edit-${n.toString()}@example.com`,
        stored: (id) => readOrder(id).then((row) => row?.email)
    },
    {
        name: "the caller's own account",
        seed: async () => {
            const { bearer, user } = await authenticateAs('user');
            return { path: '/account', readPath: '/account', bearer, id: String(user._id) };
        },
        edit: (n) => ({ username: `me-${n.toString()}` }),
        expected: (n) => `me-${n.toString()}`,
        stored: (id) => userModel.findById(id).then((row) => row?.username)
    }
];

/** A GET's `ETag` header, asserted present. */
const etagOf = (response: { headers: Record<string, unknown> }): string => {
    const tag = response.headers.etag;
    if (typeof tag !== 'string') throw new Error('no ETag on the response');
    return tag;
};

describe.each(RESOURCES)('conditional writes on $name', (resource) => {
    it('hands out an ETag on the item read, equal to the quoted epoch of updatedAt', async () => {
        const { readPath, bearer } = await resource.seed();

        const response = await api().get(readPath).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(etagOf(response)).toBe(
            `"${new Date(response.body.data.updatedAt as string).getTime().toString()}"`
        );
    });

    it("writes when If-Match is the tag just read, and answers the row's NEW tag", async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        const read = await api().get(readPath).set('Authorization', bearer);

        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read))
            .send(resource.edit(1));

        expect(write.status).toBe(200);
        expect(etagOf(write)).not.toBe(etagOf(read));
        expect(await resource.stored(id)).toBe(resource.expected(1));
    });

    it('answers 412 PRECONDITION_FAILED and leaves the row alone when the tag is stale', async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        const read = await api().get(readPath).set('Authorization', bearer);
        // Someone else edits first.
        await api().patch(path).set('Authorization', bearer).send(resource.edit(1)).expect(200);

        const stale = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read))
            .send(resource.edit(2));

        expect(stale.status).toBe(412);
        expect(stale.body.errors[0].code).toBe('PRECONDITION_FAILED');
        expect(await resource.stored(id)).toBe(resource.expected(1));
    });

    it('is unconditional without the header: the old behaviour, last writer wins', async () => {
        const { path, bearer, id } = await resource.seed();

        await api().patch(path).set('Authorization', bearer).send(resource.edit(1)).expect(200);
        const second = await api().patch(path).set('Authorization', bearer).send(resource.edit(2));

        expect(second.status).toBe(200);
        expect(await resource.stored(id)).toBe(resource.expected(2));
    });

    it('accepts `*` for any existing row', async () => {
        const { path, bearer } = await resource.seed();

        const response = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', '*')
            .send(resource.edit(1));

        expect(response.status).toBe(200);
    });

    it.each(['garbage', '"unclosed', 'W/"1"'])(
        'refuses %p: a header that cannot match is never read as "no header"',
        async (header) => {
            const { path, bearer } = await resource.seed();

            const response = await api()
                .patch(path)
                .set('Authorization', bearer)
                .set('If-Match', header)
                .send(resource.edit(1));

            expect(response.status).toBe(412);
        }
    );

    it('lets exactly one of two concurrent edits through when both carry the same tag', async () => {
        const { path, readPath, bearer } = await resource.seed();
        const tag = etagOf(await api().get(readPath).set('Authorization', bearer));

        const responses = await Promise.all(
            [1, 2].map((n) =>
                api()
                    .patch(path)
                    .set('Authorization', bearer)
                    .set('If-Match', tag)
                    .send(resource.edit(n))
            )
        );

        expect(responses.map((response) => response.status).toSorted()).toEqual([200, 412]);
    });
});

/** Resources that also take a DELETE by id — the account deletes through its own two-step flow. */
const DELETABLE = RESOURCES.filter((resource) => resource.name !== "the caller's own account");

describe.each(DELETABLE)('conditional DELETE on $name', (resource) => {
    it('refuses a stale tag and keeps the row', async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        const read = await api().get(readPath).set('Authorization', bearer);
        await api().patch(path).set('Authorization', bearer).send(resource.edit(1)).expect(200);

        const response = await api()
            .delete(`${path}?hardDelete=true`)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read));

        expect(response.status).toBe(412);
        expect(await resource.stored(id)).toBe(resource.expected(1));
    });

    it('deletes on the current tag', async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        const read = await api().get(readPath).set('Authorization', bearer);

        const response = await api()
            .delete(`${path}?hardDelete=true`)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read));

        expect(response.status).toBe(200);
        expect(await resource.stored(id)).toBeUndefined();
    });
});

describe('PUT', () => {
    // The whole representation of an order is its email; a PUT is the same precondition as a PATCH.
    it('is refused with 412 on a stale tag, and writes on the current one', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)]);
        const path = `/orders/${String(order._id)}`;
        const read = await api().get(path).set('Authorization', bearer);
        await api()
            .patch(path)
            .set('Authorization', bearer)
            .send({ email: 'first@example.com' })
            .expect(200);

        const stale = await api()
            .put(path)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read))
            .send({ email: 'stale@example.com' });
        const current = await api().get(path).set('Authorization', bearer);
        const fresh = await api()
            .put(path)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(current))
            .send({ email: 'fresh@example.com' });

        expect(stale.status).toBe(412);
        expect(fresh.status).toBe(200);
        const stored = await readOrder(String(order._id));
        expect(stored?.email).toBe('fresh@example.com');
    });
});

describe('a product edited through its translations', () => {
    beforeEach(() => givenLocale('en'));

    it('moves the ETag even though no column on the product changed', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const before = etagOf(await api().get(`${path}/admin`).set('Authorization', bearer));

        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', before)
            .send({ translations: { en: { title: 'A new English title' } } });

        expect(write.status).toBe(200);
        expect(etagOf(write)).not.toBe(before);
        expect(etagOf(await api().get(`${path}/admin`).set('Authorization', bearer))).toBe(
            etagOf(write)
        );
    });
});

describe('the ETag validates writes only', () => {
    it('never answers 304 to If-None-Match: a tag cannot see config-derived parts of the body', async () => {
        const product = await createProduct();
        const first = await api().get(`/products/${product.id}`);

        const second = await api()
            .get(`/products/${product.id}`)
            .set('If-None-Match', etagOf(first));

        expect(second.status).toBe(200);
        expect(second.body.data.id).toBe(product.id);
    });
});
