/**
 * Conditional writes (RFC 9110 §13.1.1): `ETag` on a versioned row's read, optional `If-Match` on
 * its PUT/PATCH/DELETE, 412 when the row moved since the caller read it.
 *
 * Driven through the real app because the property spans four layers — the item controller that
 * stamps the tag, the update/delete controllers that open the precondition, the repository that
 * checks and fences it, and the error interpreter that answers 412. A unit test of any one of
 * them cannot say the caller's stale edit actually did not land.
 *
 * Versioned today: products, users, orders, webhook subscriptions and the caller's own account. The version is the row's
 * `editRevision` counter (see `src/infrastructure/persistence/versioning.ts`).
 */
import { Types, connection } from 'mongoose';
import { api, authenticateAs } from '@tests/http';
import { setupTestDb } from '@tests/setup-test-db';
import { createProduct } from '@modules/products/tests/factories';
import { createUser } from '@modules/users/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    toOrderItem,
    readOrder,
    orderRepository
} from '@modules/orders/tests/factories';
import { OrderPaymentStatus, OrderStatus } from '@types';
import { deliveryService } from '@modules/delivery/services';
import { fulfillmentOrdersOf } from '@modules/delivery/tests/factories';
import { asAdmin, callerContextAs } from '@tests/callers';
import { productModel } from '@modules/products/model';
import { productRepository } from '@modules/products/repository';
import { inventoryService } from '@modules/inventory';
import { webhookSubscriptionModel } from '@modules/webhooks/model';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { userModel } from '@modules/users/model';
import { userRepository } from '@modules/users/repository';
import { setPassword } from '@modules/users/services/credentials';
import type { UserDocument } from '@modules/users/model';
import {
    PreconditionFailedError,
    runWithPrecondition,
    versionOf,
    etagOf as etagFor
} from '@infrastructure/persistence/versioning';
import { localeModel } from '@modules/locales/model';
import { localeRepository } from '@modules/locales/repository';
import { givenLocale } from '@modules/locales/tests/factories';

setupTestDb();

/** What one versioned resource needs to be driven the same way as the others. */
interface Resource {
    /** The resource's name in the test title. */
    name: string;
    /** The collection that holds the row, to read its stored counter. */
    collection: string;
    /** Seeds a row: the path that writes it, the path that reads it, the caller, and the row's id. */
    seed: () => Promise<{ path: string; readPath: string; bearer: string; id: string }>;
    /** Brings a seeded row to a state its hard delete accepts (an order must be canceled). */
    readyToDelete?: (id: string) => Promise<unknown>;
    /** A body the resource accepts on PATCH; `n` makes two edits differ. */
    edit: (n: number) => Record<string, unknown>;
    /** What `stored` reads back once edit `n` has landed. */
    expected: (n: number) => unknown;
    /** Reads back the one field `edit` writes, by row id. */
    stored: (id: string) => Promise<unknown>;
    /** The query string its DELETE takes; a resource with one delete tier takes none. */
    deleteQuery?: string;
}

/** The four versioned resources. Each edit touches one field no lifecycle rule guards. */
const RESOURCES: Resource[] = [
    {
        name: 'a product',
        collection: 'products',
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
        collection: 'users',
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
        collection: 'orders',
        seed: async () => {
            const { bearer, user } = await authenticateAs('admin');
            const product = await createProduct();
            const order = await createOrder(user, [toOrderItem(product, 1)]);
            const id = String(order._id);
            return { path: `/orders/${id}`, readPath: `/orders/${id}`, bearer, id };
        },
        readyToDelete: (id) => forceOrderStatus(id, 'canceled'),
        edit: (n) => ({ email: `edit-${n.toString()}@example.com` }),
        expected: (n) => `edit-${n.toString()}@example.com`,
        stored: (id) => readOrder(id).then((row) => row?.email)
    },
    {
        name: "the caller's own account",
        collection: 'users',
        seed: async () => {
            const { bearer, user } = await authenticateAs('user');
            return { path: '/account', readPath: '/account', bearer, id: String(user._id) };
        },
        edit: (n) => ({ username: `me-${n.toString()}` }),
        expected: (n) => `me-${n.toString()}`,
        stored: (id) => userModel.findById(id).then((row) => row?.username)
    },
    {
        name: 'a webhook subscription',
        collection: 'webhooksubscriptions',
        seed: async () => {
            const { bearer } = await authenticateAs('admin');
            const created = await api()
                .post('/webhooks/subscriptions')
                .set('Authorization', bearer)
                .send({ url: 'https://example.test/inbox', eventTypes: ['order.paid'] })
                .expect(201);
            const id = String(created.body.id);
            const path = `/webhooks/subscriptions/${id}`;
            return { path, readPath: path, bearer, id };
        },
        deleteQuery: '',
        edit: (n) => ({ description: `edit-${n.toString()}` }),
        expected: (n) => `edit-${n.toString()}`,
        stored: (id) => webhookSubscriptionModel.findById(id).then((row) => row?.description)
    },
    {
        name: 'a language',
        collection: 'locales',
        // Addressed by its tag, versioned by its row: the one resource whose path id is not its `_id`.
        seed: async () => {
            const { bearer } = await authenticateAs('admin');
            const language = await givenLocale('pt-BR');
            const path = '/locales/pt-BR';
            return { path, readPath: path, bearer, id: String(language._id) };
        },
        edit: (n) => ({ name: `Portugues ${'x'.repeat(n)}` }),
        expected: (n) => `Portugues ${'x'.repeat(n)}`,
        stored: (id) => localeModel.findById(id).then((row) => row?.name)
    }
];

/** The counter a row has in the database, straight off the collection. */
const storedRevision = (collection: string, id: string): Promise<unknown> =>
    connection
        .collection(collection)
        .findOne({ _id: new Types.ObjectId(id) })
        .then((row) => row?.editRevision);

/**
 * A GET's `ETag` header, asserted present.
 * @throws {Error} when the response carries no ETag
 */
const etagOf = (response: { headers: Record<string, unknown> }): string => {
    const tag = response.headers.etag;
    if (typeof tag !== 'string') throw new TypeError('no ETag on the response');
    return tag;
};

/**
 * The edit part of a response's two-part `ETag` (`"<editRevision>.<digest>"`): the number a write
 * compares.
 */
const editPartOf = (response: { headers: Record<string, unknown> }): string =>
    etagOf(response).slice(1).split('.', 1)[0] ?? '';

describe.each(RESOURCES)('conditional writes on $name', (resource) => {
    it("hands out an ETag on the item read: the row's stored counter, then a body digest", async () => {
        const { readPath, bearer, id } = await resource.seed();

        const response = await api().get(readPath).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(editPartOf(response)).toBe(String(await storedRevision(resource.collection, id)));
        // The counter is the version, not part of the representation.
        expect(response.body).not.toHaveProperty('editRevision');
    });

    it('moves the counter by one per edit, whatever the clock says', async () => {
        const { path, bearer, id } = await resource.seed();
        const before = Number(await storedRevision(resource.collection, id));

        await api().patch(path).set('Authorization', bearer).send(resource.edit(1)).expect(200);
        await api().patch(path).set('Authorization', bearer).send(resource.edit(2)).expect(200);

        expect(await storedRevision(resource.collection, id)).toBe(before + 2);
    });

    it("writes when If-Match is the tag just read, and answers the row's NEW tag", async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        await resource.readyToDelete?.(id);
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
        await resource.readyToDelete?.(id);
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

describe('a language: what moves its edit tag', () => {
    it('matches a lowercase tag in the path, and answers the stored tag', async () => {
        const { readPath, bearer } = await resourceNamed('a language').seed();
        const tag = etagOf(await api().get(readPath).set('Authorization', bearer));

        const write = await api()
            .patch('/locales/pt-br')
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send({ name: 'Portugues' });

        expect(write.status).toBe(200);
    });

    it('is not moved by a dictionary write, so an open name form still saves', async () => {
        const { path, readPath, bearer, id } = await resourceNamed('a language').seed();
        const tag = etagOf(await api().get(readPath).set('Authorization', bearer));
        const before = await storedRevision('locales', id);

        await localeRepository.bumpRevision('pt-BR');
        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send({ name: 'Portugues' });

        expect(await storedRevision('locales', id)).toBe(Number(before) + 1);
        expect(write.status).toBe(200);
    });

    it('is moved by switching the language off, so an open form gets 412', async () => {
        const { path, readPath, bearer } = await resourceNamed('a language').seed();
        const tag = etagOf(await api().get(readPath).set('Authorization', bearer));
        await api().post('/locales/pt-BR/deactivate').set('Authorization', bearer).expect(200);

        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send({ name: 'Portugues' });

        expect(write.status).toBe(412);
    });
});

describe('a webhook subscription: delivery bookkeeping is not an edit', () => {
    it('keeps an earlier tag valid after a delivery failure was recorded', async () => {
        const { path, readPath, bearer, id } = await resourceNamed('a webhook subscription').seed();
        const tag = etagOf(await api().get(readPath).set('Authorization', bearer));

        await webhookSubscriptionRepository.recordOutcome(id, false);
        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send({ description: 'after-failure' });

        expect(write.status).toBe(200);
    });
});

/** Resources that also take a DELETE by id — the account deletes through its own two-step flow. */
const DELETABLE = RESOURCES.filter(
    // A language's delete is unconditional: its cascade removes the rows before the language.
    (resource) => resource.name !== "the caller's own account" && resource.name !== 'a language'
);

describe.each(DELETABLE)('conditional DELETE on $name', (resource) => {
    it('refuses a stale tag and keeps the row', async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        await resource.readyToDelete?.(id);
        const read = await api().get(readPath).set('Authorization', bearer);
        await api().patch(path).set('Authorization', bearer).send(resource.edit(1)).expect(200);

        const response = await api()
            .delete(`${path}${resource.deleteQuery ?? '?hardDelete=true'}`)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read));

        expect(response.status).toBe(412);
        expect(await resource.stored(id)).toBe(resource.expected(1));
    });

    it('deletes on the current tag', async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        await resource.readyToDelete?.(id);
        const read = await api().get(readPath).set('Authorization', bearer);

        const response = await api()
            .delete(`${path}${resource.deleteQuery ?? '?hardDelete=true'}`)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read));

        expect(response.status).toBe(204);
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

    it('answers no validator, neither a tag nor a modification date (RFC 9110 §9.3.4)', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)]);

        const put = await api()
            .put(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({ email: 'put@example.com' });

        expect(put.status).toBe(200);
        expect(put.headers).not.toHaveProperty('etag');
        expect(put.headers).not.toHaveProperty('last-modified');
    });
});

describe('a product edited through its translations', () => {
    beforeEach(() => givenLocale('en'));

    it('moves the ETag even though no column on the product changed', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const before = etagOf(await api().get(path).set('Authorization', bearer));

        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', before)
            .send({ translations: { en: { title: 'A new English title' } } });

        expect(write.status).toBe(200);
        expect(etagOf(write)).not.toBe(before);
        // A PATCH answers a thinner body than a GET, so only the edit part is shared.
        expect(editPartOf(await api().get(path).set('Authorization', bearer))).toBe(
            editPartOf(write)
        );
    });
});

describe('a product edited only through the locales translations route', () => {
    beforeEach(() => Promise.all([givenLocale('en'), givenLocale('it')]));

    it('moves the ETag even for a locale that is not the fallback', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const admin = `/products/${product.id}`;
        const before = etagOf(await api().get(admin).set('Authorization', bearer));

        await api()
            .patch(`/locales/translations/product/${product.id}`)
            .set('Authorization', bearer)
            .send({ it: { fields: { title: 'Un titolo italiano' }, origin: 'human' } })
            .expect(200);

        expect(etagOf(await api().get(admin).set('Authorization', bearer))).not.toBe(before);
    });

    it('refuses a stale PUT /products/{id} that would overwrite those translations', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const stale = etagOf(await api().get(path).set('Authorization', bearer));
        await api()
            .patch(`/locales/translations/product/${product.id}`)
            .set('Authorization', bearer)
            .send({ it: { fields: { title: 'Un titolo italiano' }, origin: 'human' } })
            .expect(200);

        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', stale)
            .send({ tags: ['late'] });

        expect(write.status).toBe(412);
    });
});

/** One locale's PATCH body: `n` makes two saves differ. */
const italian = (n: number) => ({
    it: { fields: { title: `Titolo ${'x'.repeat(n)}` }, origin: 'human' }
});

describe('the translations route of a product, fenced on the product', () => {
    beforeEach(() => Promise.all([givenLocale('en'), givenLocale('it')]));

    it('writes on the tag its own GET handed out, and answers the new one for the next save', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/locales/translations/product/${product.id}`;
        const read = await api().get(path).set('Authorization', bearer);

        const first = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(read))
            .send(italian(1));
        const second = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(first))
            .send(italian(2));

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
    });

    it('answers 412 and writes no row when the product was edited since the read', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/locales/translations/product/${product.id}`;
        const tag = etagOf(await api().get(path).set('Authorization', bearer));
        await api()
            .patch(`/products/${product.id}`)
            .set('Authorization', bearer)
            .send({ tags: ['edited'] })
            .expect(200);

        const stale = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send(italian(1));
        const after = await api().get(path).set('Authorization', bearer);

        expect(stale.status).toBe(412);
        expect(after.body.translations).toEqual([]);
    });

    it('refuses a stale PUT the same way', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/locales/translations/product/${product.id}`;
        const tag = etagOf(await api().get(path).set('Authorization', bearer));
        await api()
            .patch(`/products/${product.id}`)
            .set('Authorization', bearer)
            .send({ tags: ['edited'] })
            .expect(200);

        const stale = await api()
            .put(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send({ en: { fields: { title: 'A late English title' } }, ...italian(1) });

        expect(stale.status).toBe(412);
    });

    it('is not refused by a stock move, which is not an edit', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/locales/translations/product/${product.id}`;
        const tag = etagOf(await api().get(path).set('Authorization', bearer));

        await inventoryService.receive(product.id, 3, undefined, callerContextAs('admin'));
        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send(italian(1));

        expect(write.status).toBe(200);
    });

    it('answers 404 on a read of a product that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get(`/locales/translations/product/${new Types.ObjectId().toString()}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('a user whose role is handed out at the door', () => {
    it('moves the ETag, so an edit holding the old tag is refused', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'target@example.com', username: 'target' });
        const path = `/users/${String(target._id)}`;
        const before = etagOf(await api().get(path).set('Authorization', bearer));

        const granted = await api()
            .post(`${path}/assign-role`)
            .set('Authorization', bearer)
            .send({ role: 'support' });
        const stale = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', before)
            .send({ username: 'late-edit' });

        expect(granted.status).toBe(200);
        expect(etagOf(await api().get(path).set('Authorization', bearer))).not.toBe(before);
        expect(stale.status).toBe(412);
    });

    it('is a state guard, not a fence: a repeat is a 409 and a different role is accepted', async () => {
        const { bearer } = await authenticateAs('admin');
        const target = await createUser({ email: 'target@example.com', username: 'target' });
        const door = `/users/${String(target._id)}/assign-role`;
        const assign = (role: string) =>
            api().post(door).set('Authorization', bearer).send({ role });

        const first = await assign('support');
        const repeat = await assign('support');
        const other = await assign('manager');
        const statuses = [first.status, repeat.status, other.status];

        expect(statuses).toEqual([200, 409, 200]);
    });
});

describe('a save is fenced, not only checked', () => {
    it('does not overwrite a row edited between the load and the save', async () => {
        const product = await createProduct();
        const loaded = await productRepository.findById(product.id);
        if (!loaded) throw new Error('seeded product missing');
        const tag = etagFor(versionOf(loaded) ?? 0, 'x');
        // Another writer lands after the service loaded the row: its tag is the same until then.
        await productModel.updateOne({ _id: product.id }, { $set: { tags: ['theirs'] } });
        loaded.tags = ['mine'];

        await expect(
            runWithPrecondition({ id: product.id, etags: [tag] }, () =>
                productRepository.save(loaded)
            )
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        const stored = await productModel.findById(product.id);
        expect(stored?.tags).toEqual(['theirs']);
    });
});

/** Loads a fresh target, reads its tag, applies `change`, then PATCHes with the old tag. */
const patchAfter = async (change: (id: string) => Promise<unknown>) => {
    const { bearer } = await authenticateAs('admin');
    const target = await createUser({ email: 'target@example.com', username: 'target' });
    const id = String(target._id);
    const path = `/users/${id}`;
    const tag = etagOf(await api().get(path).set('Authorization', bearer));

    await change(id);
    return api()
        .patch(path)
        .set('Authorization', bearer)
        .set('If-Match', tag)
        .send({ username: 'after-change' });
};

/** Runs the account's password write on a freshly loaded document. */
const setPasswordOf = async (id: string, extra?: (user: UserDocument) => void) => {
    const loaded = await userRepository.findById(id);
    if (!loaded) throw new Error('seeded user missing');
    extra?.(loaded);
    return setPassword(loaded, 'A-new-Passw0rd!x');
};

/** A `processing` order, its tag read, `change` applied, then a staff PATCH with the old tag. */
const patchOrderAfter = async (
    change: (orderId: string, productId: string) => Promise<unknown>
) => {
    const { bearer, user } = await authenticateAs('admin');
    const product = await createProduct({ price: '10.00' });
    const order = await createOrder(user, [toOrderItem(product, 2)], {
        status: OrderStatus.processing
    });
    const id = String(order._id);
    const path = `/orders/${id}`;
    const tag = etagOf(await api().get(path).set('Authorization', bearer));

    await change(id, String(product._id));
    return api()
        .patch(path)
        .set('Authorization', bearer)
        .set('If-Match', tag)
        .send({ email: 'after-report@example.com' });
};

/** Ships `quantity` units of the order's product from its one physical fulfillment order. */
const shipUnits = async (orderId: string, productId: string, quantity: number) => {
    const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
    return deliveryService.shipFulfillmentOrder(
        String(fulfillmentOrder._id),
        { lines: [{ productId, quantity }] },
        asAdmin(),
        callerContextAs('admin')
    );
};

describe('writes that are not an edit leave the tag alone', () => {
    it('lets a product edit through after a stock move', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const tag = etagOf(await api().get(path).set('Authorization', bearer));

        await inventoryService.receive(product.id, 3, undefined, callerContextAs('admin'));
        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send({ tags: ['after-stock'] });

        expect(write.status).toBe(200);
    });

    describe("on an order, another module's report", () => {
        it('keeps the tag through a refund projection', async () => {
            const write = await patchOrderAfter((id) =>
                orderRepository.setProjection(id, {
                    paymentStatus: OrderPaymentStatus.partially_refunded
                })
            );

            expect(write.status).toBe(200);
        });

        it('keeps the tag through the stamp that money landed', async () => {
            const write = await patchOrderAfter((id) => orderRepository.markMoneyReceived(id));

            expect(write.status).toBe(200);
        });

        it('keeps the tag through a partial shipment, the order staying `processing`', async () => {
            const write = await patchOrderAfter((id, productId) => shipUnits(id, productId, 1));

            expect(write.status).toBe(200);
        });

        it('moves the tag when a full shipment moves the status to `shipped`', async () => {
            const write = await patchOrderAfter((id, productId) => shipUnits(id, productId, 2));

            expect(write.status).toBe(412);
        });
    });

    describe('on a user', () => {
        it('keeps the tag through a password change', async () => {
            const write = await patchAfter((id) => setPasswordOf(id));

            expect(write.status).toBe(200);
        });

        it('moves the tag when the same write re-stamps the verified address (a reset)', async () => {
            const write = await patchAfter((id) =>
                setPasswordOf(id, (user) => {
                    user.verifiedAt = new Date();
                })
            );

            expect(write.status).toBe(412);
        });

        it('keeps the tag through the reaper warning', async () => {
            const write = await patchAfter((id) =>
                userRepository.markInactivityWarned(id, new Date())
            );

            expect(write.status).toBe(200);
        });
    });
});

describe('a hard delete is fenced, not only checked', () => {
    it('keeps a row edited between the load and the delete', async () => {
        const target = await createUser({ email: 'fence@example.com', username: 'fence' });
        const loaded = await userRepository.findById(String(target._id));
        if (!loaded) throw new Error('seeded user missing');
        const tag = etagFor(versionOf(loaded) ?? 0, 'x');
        // Another writer lands after the service loaded the row.
        await userModel.updateOne({ _id: target._id }, { $set: { username: 'moved' } });

        await expect(
            runWithPrecondition({ id: String(target._id), etags: [tag] }, () =>
                userRepository.deleteOne(loaded)
            )
        ).rejects.toBeInstanceOf(PreconditionFailedError);

        expect(await userModel.findById(target._id)).not.toBeNull();
    });
});

/**
 * One of {@link RESOURCES} by name.
 * @throws {Error} when no resource has that name
 */
const resourceNamed = (name: string): Resource => {
    const found = RESOURCES.find((resource) => resource.name === name);
    if (!found) throw new Error(`no resource named ${name}`);
    return found;
};

describe('the ETag is two parts: reads compare all of it, writes the edit part', () => {
    it('answers an empty 304 to a matching If-None-Match, keeping the ETag', async () => {
        const { readPath, bearer } = await resourceNamed('a user').seed();
        const first = await api().get(readPath).set('Authorization', bearer);

        const second = await api()
            .get(readPath)
            .set('Authorization', bearer)
            .set('If-None-Match', etagOf(first));

        expect(second.status).toBe(304);
        expect(second.text).toBe('');
        expect(etagOf(second)).toBe(etagOf(first));
    });

    it('answers a guest 304 on a product revisit', async () => {
        const product = await createProduct();
        const first = await api().get(`/products/${product.id}`);

        const second = await api()
            .get(`/products/${product.id}`)
            .set('If-None-Match', etagOf(first));

        expect(second.status).toBe(304);
        expect(etagOf(second)).toBe(etagOf(first));
    });

    it('answers a 304 after a stock move: the product carries no stock, so its body and tag did not move', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const old = await api().get(path).set('Authorization', bearer);
        // A stock move is not an edit and the product answer carries no stock: nothing moved.
        await productModel.updateOne(
            { _id: product.id },
            { $set: { onHand: 123 } },
            { timestamps: false }
        );

        const reread = await api()
            .get(path)
            .set('Authorization', bearer)
            .set('If-None-Match', etagOf(old));
        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', etagOf(old))
            .send({ tags: ['after-stock-move'] });

        expect(reread.status).toBe(304);
        expect(etagOf(reread)).toBe(etagOf(old));
        expect(write.status).toBe(200);
    });

    it('refuses an If-Match whose edit part is old, even with the current digest', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const old = etagOf(await api().get(path).set('Authorization', bearer));
        await api()
            .patch(path)
            .set('Authorization', bearer)
            .send({ tags: ['moved'] })
            .expect(200);

        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', old)
            .send({ tags: ['mine'] });

        expect(write.status).toBe(412);
    });

    it.each(['an order', 'a user'])(
        'answers 304 on %s read to a caller holding the tag',
        async (name) => {
            const { readPath, bearer } = await resourceNamed(name).seed();
            const first = await api().get(readPath).set('Authorization', bearer);

            const second = await api()
                .get(readPath)
                .set('Authorization', bearer)
                .set('If-None-Match', etagOf(first));

            expect(second.status).toBe(304);
        }
    );
});
