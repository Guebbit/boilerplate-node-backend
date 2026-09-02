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
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/fixtures';
import { createOrder, toOrderItem } from '@modules/orders/tests/fixtures';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/fixtures';
import { orderRepository } from '@modules/orders';

// No real Chromium in the test environment — same stub `invoice-locale.test.ts` uses. Only the
// invoice route's scope is under test here, not the render itself.
jest.mock('@infrastructure/adapters/pdf', () => ({
    renderHtmlToPdf: () => Promise.resolve(Buffer.from('pdf'))
}));

setupTestDb();

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
});

describe('GET /orders', () => {
    it('matches the contract for an admin caller', async () => {
        const { bearer, user } = await authenticateAs('admin');
        await seedOrderFor(user);
        const response = await api().get('/orders').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract for a non-admin caller, scoped to their own orders', async () => {
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
    // The admin path uses findById and the non-admin path uses an aggregate — two routes into
    // the same transform, so both are asserted against the contract.
    it('matches the contract on the admin (unscoped) path', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const order = await seedOrderFor(user);
        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the contract on the non-admin (scoped) path', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await seedOrderFor(user);
        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
    });

    /*
     * One case per role: the two roles used different queries and used to answer differently for
     * a malformed id — admin's `findById` raised a Mongoose `CastError` mapped to 404, the scoped
     * aggregate's own coercion raised a `BSONError` that reached the interpreter as 422.
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

    it("a non-admin cannot download another customer's invoice — absence, not refusal", async () => {
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

    it("an admin CAN download another customer's invoice — the scope narrows, the route isn't broken", async () => {
        const { user: owner } = await authenticateAs('user');
        const order = await seedOrderFor(owner);
        const { bearer: adminBearer } = await authenticateAs('admin');

        const response = await api()
            .get(`/orders/${String(order._id)}/invoice`)
            .set('Authorization', adminBearer);

        expect(response.status).toBe(200);
        expect(response.headers['content-type']).toBe('application/pdf');
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

    it("lets an admin cancel someone else's pending order", async () => {
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
