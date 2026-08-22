/**
 * Contract tests for /delivery.
 *
 * Three routes, three audiences: the methods list is public, the shipment read is the owner's,
 * the courier tick is staff's. These pin that each contract branch is reached over HTTP; the
 * courier's ordering rules live in the unit suite.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factory';
import { createOrder, toOrderItem } from '@modules/orders/tests/factory';
import { orderRepository } from '@modules/orders';
import { shipOrder } from '@modules/delivery/service';

setupTestDb();

/** A customer logged in with one order already shipped and its parcel created. */
const authenticateWithShipment = async () => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'shipped');
    await shipOrder(String(order._id));
    return { bearer, order };
};

describe('GET /delivery/methods', () => {
    it('matches the contract, unauthenticated included — rates are pre-purchase information', async () => {
        const response = await api().get('/delivery/methods');

        expect(response.status).toBe(200);
        expect(response.body.data.methods.length).toBeGreaterThan(0);
        expect(response).toSatisfyApiSpec();
    });
});

describe('GET /delivery/order/{orderId}', () => {
    it('matches the contract for the caller`s own shipment', async () => {
        const { bearer, order } = await authenticateWithShipment();

        const response = await api()
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.trackingCode).toContain('TRK-');
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when the order has not shipped', async () => {
        const { user, bearer } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract when unauthenticated', async () => {
        const response = await api().get('/delivery/order/65dc8a99604c307b702b5ccc');

        expect(response.status).toBe(401);
        expect(response).toSatisfyApiSpec();
    });
});

describe('POST /delivery/advance', () => {
    it('matches the contract and reports the parcels that arrived', async () => {
        await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');

        const response = await api().post('/delivery/advance').set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.advanced).toBe(1);
        expect(response).toSatisfyApiSpec();
    });

    it('matches the error contract for a non-admin — the courier is staff`s button', async () => {
        const { bearer } = await authenticateAs('user');

        const response = await api().post('/delivery/advance').set('Authorization', bearer);

        expect(response.status).toBe(403);
        expect(response).toSatisfyApiSpec();
    });
});
