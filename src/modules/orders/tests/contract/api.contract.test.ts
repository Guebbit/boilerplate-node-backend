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

// No real Chromium in the test environment — same stub `invoice-pdf.test.ts` uses. Only the
// invoice route's scope is under test here, not the render itself.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: () => Promise.resolve(Buffer.from('pdf'))
}));

setupTestDb();

/**
 * `invoicePdfStatus: 'ready'` with nothing actually stored: the controller's own fallback for
 * that combination renders inline (see `get-order-invoice.ts`), which is what lets these fixtures
 * exercise the download route through the mocked renderer above without a real queued worker
 * ever having run. Scope/permission tests below have nothing to do with the async pipeline
 * itself — that pipeline has its own coverage in `orders/tests/unit/invoice-pdf.test.ts`.
 */
const seedOrderFor = async (user: Parameters<typeof createOrder>[0]) => {
    const product = await createProduct();
    return createOrder(user, [toOrderItem(product, 2)], { invoicePdfStatus: 'ready' });
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
        await seedOrderFor(user);
        const response = await api().get('/orders').set('Authorization', bearer);

        expect(response.status).toBe(200);
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
    // The unscoped path uses findById and the scoped path uses an aggregate — two routes into
    // the same transform, so both are asserted against the contract.
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
     * One case per role: the two roles run different queries, and a malformed id can easily answer
     * differently between them — the unscoped `findById` raises a Mongoose `CastError` mapped to 404,
     * while the scoped aggregate's own coercion raises a `BSONError`, which the interpreter maps to
     * 422 unless something upstream of it already turned the id away. Both need their own case, or
     * a regression on either path alone has nothing to catch it.
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

    it.each([['admin'], ['user']] as const)(
        'the invoice route answers the same 404 for a %s caller',
        async (role) => {
            const { bearer } = await authenticateAs(role);

            const response = await api()
                .get('/orders/not-an-id/invoice')
                .set('Authorization', bearer);

            expect(response.status).toBe(404);
            expect(response).toSatisfyApiSpec();
        }
    );

    it("a scoped caller cannot download another customer's invoice — absence, not refusal", async () => {
        // `getOrderInvoice` scopes through `orderService.callerScope`, the same rule `GET
        // /orders/:id` enforces. The malformed-id case above 404s before any scope is consulted,
        // so it cannot prove this — this is the one request that names a REAL order owned by
        // someone else.
        const { user: owner } = await authenticateAs('user');
        const order = await seedOrderFor(owner);

        const stranger = await createUser({ email: 'stranger@example.com', username: 'stranger' });
        const login = await api()
            .post('/account/login')
            .send({ email: stranger.email, password: PLAIN_PASSWORD });

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', `Bearer ${login.body.data.token as string}`);

        expect(response.status).toBe(404);
    });

    it("an unrestricted caller CAN download another customer's invoice — the scope narrows, the route isn't broken", async () => {
        const { user: owner } = await authenticateAs('user');
        const order = await seedOrderFor(owner);
        const { bearer: ownerBearer } = await authenticateAs('admin');

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', ownerBearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
    });

    /*
     * The schema default (`invoicePdfStatus: 'pending'` from the moment an order is written) is
     * what every OTHER order in this file overrides away with `invoicePdfStatus: 'ready'` — this
     * is the one test that leaves it alone, to prove the 202 side of the contract actually answers
     * what `openapi.yaml` promises.
     */
    it('answers 202 while the invoice worker has not finished yet', async () => {
        const { user: owner, bearer } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(owner, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', bearer);

        expect(response.status).toBe(202);
        expect(response.body.data).toEqual({ invoicePdfStatus: 'pending' });
        expect(response).toSatisfyApiSpec();
    });
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
