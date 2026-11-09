/**
 * Conditional writes (RFC 9110 §13.1.1): `ETag` on a versioned row's read, optional `If-Match` on
 * its PUT/PATCH/DELETE, 412 when the row moved since the caller read it.
 *
 * Driven through the real app because the property spans four layers — the item controller that
 * stamps the tag, the update/delete controllers that open the precondition, the repository that
 * checks and fences it, and the error interpreter that answers 412. A unit test of any one of
 * them cannot say the caller's stale edit actually did not land.
 *
 * Versioned today: products, users, orders and the caller's own account. The version is the row's
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
    readOrder
} from '@modules/orders/tests/factories';
import { productModel } from '@modules/products/model';
import { productRepository } from '@modules/products/repository';
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
import { givenLocale } from '@modules/locales/tests/factories';

setupTestDb();

/** What one versioned resource needs to be driven the same way as the others. */
interface Resource {
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
    }
];

/** The counter a row has in the database, straight off the collection. */
const storedRevision = (collection: string, id: string): Promise<unknown> =>
    connection
        .collection(collection)
        .findOne({ _id: new Types.ObjectId(id) })
        .then((row) => row?.editRevision);

/** A GET's `ETag` header, asserted present. */
const etagOf = (response: { headers: Record<string, unknown> }): string => {
    const tag = response.headers.etag;
    if (typeof tag !== 'string') throw new Error('no ETag on the response');
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

/** Resources that also take a DELETE by id — the account deletes through its own two-step flow. */
const DELETABLE = RESOURCES.filter((resource) => resource.name !== "the caller's own account");

describe.each(DELETABLE)('conditional DELETE on $name', (resource) => {
    it('refuses a stale tag and keeps the row', async () => {
        const { path, readPath, bearer, id } = await resource.seed();
        await resource.readyToDelete?.(id);
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
        await resource.readyToDelete?.(id);
        const read = await api().get(readPath).set('Authorization', bearer);

        const response = await api()
            .delete(`${path}?hardDelete=true`)
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

describe('writes that are not an edit leave the tag alone', () => {
    it('lets a product edit through after the stock mirror moved', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const tag = etagOf(await api().get(path).set('Authorization', bearer));

        await productRepository.syncStockCache(product.id, { onHand: 3, reserved: 1 });
        const write = await api()
            .patch(path)
            .set('Authorization', bearer)
            .set('If-Match', tag)
            .send({ tags: ['after-stock'] });

        expect(write.status).toBe(200);
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
 * @param name - the resource's `name`
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

    it('answers a 200 and a new tag once the body changed without an edit (a stock move)', async () => {
        const { bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const path = `/products/${product.id}`;
        const old = await api().get(path).set('Authorization', bearer);
        // A stock move is not an edit: no `editRevision` bump, but staff see the counters.
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

        expect(reread.status).toBe(200);
        expect(etagOf(reread)).not.toBe(etagOf(old));
        expect(editPartOf(reread)).toBe(editPartOf(old));
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
