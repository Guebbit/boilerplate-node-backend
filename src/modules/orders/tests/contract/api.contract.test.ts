/**
 * @module
 * Contract tests for /orders. This resource is why the contract suite exists: the list endpoint
 * returned `totalItems`/`totalQuantity`/`totalPrice` while `openapi.yaml` required a single
 * `total`, and `GET /orders/{id}` answered a different shape per caller role — nothing caught
 * either because no test crossed HTTP. Both role branches of `getById` are asserted below for
 * that reason.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { orderRepository } from '../../repository';

setupTestDb();

/** An order with real lines — the download-scope suite is `invoicing`'s own, not this file's. */
const seedOrderFor = async (user: Parameters<typeof createOrder>[0]) => {
    const product = await createProduct();
    return createOrder(user, [toOrderItem(product, 2)]);
};

describe('GET /orders — the filters it now publishes', () => {
    /*
     * `status` and `notes` were applied by the repository and named nowhere in the contract, so a
     * generated client had no way to know they worked. `notes` is staff-written text on the order,
     * so the filter is only reachable by someone who can already see it.
     */
    it('narrows by status, and by a fragment of the notes', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const paid = await createOrder(user, [toOrderItem(product, 1)]);
        const pending = await createOrder(user, [toOrderItem(product, 1)], {
            notes: 'call before dispatch'
        });
        // Reached through the transition rather than written into the column: a status the
        // application cannot arrive at is not one worth filtering for.
        await orderRepository.updateStatusIfIn(String(paid._id), ['pending'], 'paid');

        const byStatus = await api().get('/orders?status=paid').set('Authorization', bearer);
        expect(byStatus.status).toBe(200);
        expect(byStatus.body.data.items.map((o: { id: string }) => o.id)).toEqual([
            String(paid._id)
        ]);

        const byNotes = await api().get('/orders?notes=dispatch').set('Authorization', bearer);
        expect(byNotes.status).toBe(200);
        expect(byNotes.body.data.items.map((o: { id: string }) => o.id)).toEqual([
            String(pending._id)
        ]);
    });

    /*
     * The bug this pins: `orders.any.read` is held by name, not through the scope wildcard a
     * moderator never holds — asking for the wildcard alone silently dropped this filter for
     * them, so a moderator narrowing to one customer's orders got everyone's instead.
     */
    it("honours a moderator's userId filter, not just an admin's", async () => {
        const { bearer } = await authenticateAsRole('moderator');
        const product = await createProduct();
        const userA = await createUser({ email: 'user-a@example.com', username: 'user-a' });
        const userB = await createUser({ email: 'user-b@example.com', username: 'user-b' });
        const orderA = await createOrder(userA, [toOrderItem(product, 1)]);
        await createOrder(userB, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders?userId=${String(userA._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items.map((o: { id: string }) => o.id)).toEqual([
            String(orderA._id)
        ]);
    });

    // `id` is a batch filter now — Tier A. `userId`/`productId` were deliberately left scalar, so
    // a repeated key there must still 422 rather than silently reading the first value.
    it('filters by a batch of ids, and still 422s a repeated userId — the filter that stayed scalar', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const target = await createOrder(user, [toOrderItem(product, 1)]);
        await createOrder(user, [toOrderItem(product, 1)]);

        const byId = await api()
            .get(`/orders?id=${String(target._id)}`)
            .set('Authorization', bearer);
        expect(byId.status).toBe(200);
        expect(byId.body.data.items.map((o: { id: string }) => o.id)).toEqual([String(target._id)]);

        const repeatedUserId = await api()
            .get('/orders?userId=a&userId=b')
            .set('Authorization', bearer);
        expect(repeatedUserId.status).toBe(422);
        expect(repeatedUserId).toSatisfyApiSpec();
    });
});

describe('GET /orders', () => {
    it('matches the contract for an unrestricted caller', async () => {
        const { bearer, user } = await authenticateAs('admin');
        await seedOrderFor(user);
        const response = await api().get('/orders').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a scoped caller, limited to their own orders', async () => {
        const { bearer, user } = await authenticateAs('user');
        const own = await seedOrderFor(user);
        // Someone else's order in the same collection: the scope is only proven by its absence.
        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        await seedOrderFor(stranger);

        const response = await api().get('/orders').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items.map((o: { id: string }) => o.id)).toEqual([
            String(own._id)
        ]);
        expect(response.body.data.meta.totalItems).toBe(1);
        expect(response).toSatisfyApiSpec();
    });

    it('reports the three order totals rather than a single collapsed total', async () => {
        const { bearer, user } = await authenticateAs('admin');
        await seedOrderFor(user);
        const response = await api().get('/orders').set('Authorization', bearer);
        const [order] = response.body.data.items;

        expect(order.totalItems).toBe(1);
        expect(order.totalQuantity).toBe(2);
        expect(order.totalPrice).toBeGreaterThan(0);
        expect(order).not.toHaveProperty('total');
    });
});

describe('GET /orders/{id}', () => {
    // Both roles resolve through the identical `findByIdScoped` query now (an empty scope for
    // the unrestricted caller is a no-op filter addition) — asserted against the contract
    // separately anyway, since the AUTHORIZATION each role gets is still role-specific even
    // though the query shape isn't.
    it('matches the contract on the unscoped path', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);
        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract on the scoped path', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedOrderFor(user);
        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    /*
     * One case per role: both now run the identical query, but the controller's own
     * `isValidObjectId` pre-check is what actually keeps a malformed id at 404 rather than the
     * 422 `databaseErrorInterpreter` would otherwise give a `BSONError` — see `get-order-item.ts`.
     * Both roles need their own case, or a regression that skips the pre-check on either route
     * has nothing to catch it.
     */
    it.each([['admin'], ['user']] as const)(
        '404s on a malformed id for a %s caller',
        async (role) => {
            const { bearer } = await authenticateAs(role);

            const response = await api().get('/orders/not-an-id').set('Authorization', bearer);

            expect(response.status).toBe(404);
            expect(response).toSatisfyApiSpec();
        }
    );
});

describe('POST /orders/{id}/cancel', () => {
    it('lets the owner cancel a pending order, one case per role — user', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedOrderFor(user);

        const response = await api()
            .post(`/orders/${String(order._id)}/cancel`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('cancelled');
        expect(response).toSatisfyApiSpec();
    });

    it("lets an unrestricted caller cancel someone else's pending order", async () => {
        const { user: owner } = await authenticateAs('user');
        const order = await seedOrderFor(owner);
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/orders/${String(order._id)}/cancel`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('cancelled');
        expect(response).toSatisfyApiSpec();
    });

    it("answers 404 for another user's order — same as an invented id, no existence leak", async () => {
        const { user: owner } = await authenticateAs('user');
        const order = await seedOrderFor(owner);

        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        const login = await api()
            .post('/account/login')
            .send({ email: stranger.email, password: PLAIN_PASSWORD });

        const response = await api()
            .post(`/orders/${String(order._id)}/cancel`)
            .set('Authorization', `Bearer ${login.body.data.token as string}`);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for an order past pending', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedOrderFor(user);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'shipped');

        const response = await api()
            .post(`/orders/${String(order._id)}/cancel`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('ORDER_NOT_CANCELLABLE');
        expect(response).toSatisfyApiSpec();
    });

    it('a second cancel is a 409, not a double write', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedOrderFor(user);

        const first = await api()
            .post(`/orders/${String(order._id)}/cancel`)
            .set('Authorization', bearer);
        const second = await api()
            .post(`/orders/${String(order._id)}/cancel`)
            .set('Authorization', bearer);

        expect(first.status).toBe(200);
        expect(second.status).toBe(409);
        expect(second).toSatisfyApiSpec();
    });
});

describe('POST /orders/{id}/status-override', () => {
    // The bug this pins: the order carried its `statusOverrides` history straight through
    // `additionalProperties: false`'s check with nothing to catch it, because no contract test
    // ever sent a request through this route at all — the owner's admin's `actorUserId` and
    // free-text `reason` leaked into every serialized order, this response included.
    it('matches the contract and never leaks the override history onto the order it returns', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);
        await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'paid');

        const response = await api()
            .post(`/orders/${String(order._id)}/status-override`)
            .set('Authorization', bearer)
            .send({ to: 'processing', reason: 'paid offline, forcing it forward' });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(response.body.data.status).toBe('processing');
        expect(response.body.data.statusOverrides).toBeUndefined();
    });
});

/** DELETE is one-way and safe to retry; undoing a soft delete is its own verb. */
describe('POST /orders/{id}/restore', () => {
    it('brings a soft-deleted order back, matching the contract', async () => {
        const { bearer } = await authenticateAs('admin');
        const order = await seedOrderFor(await createUser());
        await api()
            .delete(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        const response = await api()
            .post(`/orders/${String(order._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect((await orderRepository.findById(String(order._id)))!.deletedAt).toBeUndefined();
        expect(response).toSatisfyApiSpec();
    });

    it('answers 409 for an order that is not deleted', async () => {
        const { bearer } = await authenticateAs('admin');
        const order = await seedOrderFor(await createUser());

        const response = await api()
            .post(`/orders/${String(order._id)}/restore`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /orders/search', () => {
    it("matches the contract for a customer, answering only the caller's own orders", async () => {
        const { bearer, user } = await authenticateAs('user');
        const own = await seedOrderFor(user);
        const stranger = await createUser({ email: 'search-stranger@example.com', username: 'ss' });
        await seedOrderFor(stranger);

        const response = await api()
            .post('/orders/search')
            .set('Authorization', bearer)
            .send({ page: 1, pageSize: 10 });

        expect(response.status).toBe(200);
        expect(response.body.data.items.map((o: { id: string }) => o.id)).toEqual([
            String(own._id)
        ]);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract with no credentials', async () => {
        const response = await api().post('/orders/search').send({});

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

/*
 * The admin write, addressed by path. `email` is the edit: it is the one field every order
 * carries that no lifecycle rule guards, so the case is about the contract, not the rules.
 */
describe('PUT /orders/{id}', () => {
    it('matches the contract with the id in the path', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);

        const response = await api()
            .put(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({ email: 'billing@example.com' });

        expect(response.status).toBe(200);
        expect(response.body.data.email).toBe('billing@example.com');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a customer', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedOrderFor(user);

        const response = await api()
            .put(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({ email: 'billing@example.com' });

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });

    // `items`/`userId` are legal on `POST /orders` (create) but not here — rewriting frozen,
    // already-invoiced lines has no safe meaning (see `services/crud.ts`'s `update`), and
    // reassigning the owner belongs to a support tool, not this endpoint. `status` left this body
    // entirely with SH1 — it moves only through an action endpoint now (see the route's own
    // description). `additionalProperties: false` on `ReplaceOrderByIdRequest` is what actually
    // enforces all three; this pins that a real HTTP request hits that refusal, not just the
    // generated Zod schema in isolation.
    it.each(['items', 'userId', 'status'])('rejects a body carrying `%s`', async (field) => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);
        const extra =
            field === 'items'
                ? { items: [{ productId: String(user._id), quantity: 1 }] }
                : field === 'userId'
                  ? { userId: String(user._id) }
                  : { status: 'processing' };

        const response = await api()
            .put(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({ email: 'billing@example.com', ...extra });

        expect(response.status).toBe(422);
        expect(response.body.success).toBe(false);
        expect(response).toSatisfyApiSpec();
    });

    // PUT names the whole resource: `email` is not clearable (an order always has one), so
    // `ReplaceOrderByIdRequest` requires it rather than leaving it optional the way PATCH does.
    it('requires `email` — a replace names the whole resource', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);

        const response = await api()
            .put(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(422);
        expect(response).toSatisfyApiSpec();
    });
});

describe('PATCH /orders/{id}', () => {
    it('matches the contract with the id in the path', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);

        const response = await api()
            .patch(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({ email: 'billing@example.com' });

        expect(response.status).toBe(200);
        expect(response.body.data.email).toBe('billing@example.com');
        expect(response).toSatisfyApiSpec();
    });

    // Merges: an empty body changes nothing, unlike PUT's whole-resource replace above.
    it('leaves the stored email untouched when the body omits it', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);

        const response = await api()
            .patch(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(200);
        expect(response.body.data.email).toBe(order.email);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a customer', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedOrderFor(user);

        const response = await api()
            .patch(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({ email: 'billing@example.com' });

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });

    it.each(['items', 'userId', 'status'])('rejects a body carrying `%s`', async (field) => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);
        const extra =
            field === 'items'
                ? { items: [{ productId: String(user._id), quantity: 1 }] }
                : field === 'userId'
                  ? { userId: String(user._id) }
                  : { status: 'processing' };

        const response = await api()
            .patch(`/orders/${String(order._id)}`)
            .set('Authorization', bearer)
            .send({ email: 'billing@example.com', ...extra });

        expect(response.status).toBe(422);
        expect(response.body.success).toBe(false);
        expect(response).toSatisfyApiSpec();
    });
});

describe('DELETE /orders and DELETE /orders/{id}/hard', () => {
    it('matches the contract for a soft delete with the id in the body', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);

        const response = await api()
            .delete('/orders')
            .set('Authorization', bearer)
            .send({ id: String(order._id) });

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        const stored = await orderRepository.findById(String(order._id));
        expect(stored?.deletedAt).toBeInstanceOf(Date);
    });

    it('matches the contract for a hard delete, and the row is gone', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);

        const response = await api()
            .delete(`/orders/${String(order._id)}/hard`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        await expect(orderRepository.findById(String(order._id))).resolves.toBeNull();
    });

    it('matches the error contract for a hard delete of an id nobody holds', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .delete('/orders/65dc8a99604c307b702b5ccc/hard')
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });
});
