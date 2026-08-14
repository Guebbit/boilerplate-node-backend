/**
 * Contract tests for /orders.
 *
 * This resource is why the contract suite exists. The list endpoint returned
 * `totalItems`/`totalQuantity`/`totalPrice` while `openapi.yaml` required a single `total`,
 * and `GET /orders/{id}` returned a *different shape depending on the caller's role* — the
 * scoped (non-admin) path aggregated the computed fields in, the admin path did a plain
 * `findById` and did not. Nothing caught either, because no test crossed HTTP.
 *
 * Both role branches of `getById` are asserted below for exactly that reason.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factory';
import { createOrder } from '@modules/orders/tests/factory';
import { createUser, PLAIN_PASSWORD } from '@modules/users/tests/factory';
import { orderRepository } from '@modules/orders';
import type { OrderDocumentItem } from '@modules/orders';

setupTestDb();

const seedOrderFor = async (user: Parameters<typeof createOrder>[0]) => {
    const product = await createProduct();
    return createOrder(user, [{ product, quantity: 2 } as unknown as OrderDocumentItem]);
};

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

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/orders');

        expect(response.status).toBe(401);
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

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().post('/orders/65dc8a99604c307b702b5ccc/cancel');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});
