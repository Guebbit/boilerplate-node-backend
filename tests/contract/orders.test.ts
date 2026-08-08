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
import '../helpers/contract';
import { setupTestDb } from '../helpers/setup-test-db';
import { api, authenticateAs } from '../helpers/http';
import { createProduct } from '../helpers/factories/products';
import { createOrder } from '../helpers/factories/orders';
import type { IOrderDocumentItem } from '../../src/models/orders';

setupTestDb();

const seedOrderFor = async (user: Parameters<typeof createOrder>[0]) => {
    const product = await createProduct();
    return createOrder(user, [{ product, quantity: 2 } as unknown as IOrderDocumentItem]);
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
