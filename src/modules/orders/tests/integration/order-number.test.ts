/**
 * @module
 * The order number, over real HTTP. The invoice's own number-and-date block is `invoicing`'s own —
 * see `src/modules/invoicing/tests/unit/emails.test.ts`.
 */
import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';

setupTestDb();

describe('GET /orders/{id} — the order number on the response', () => {
    it('omits orderNumber on an order that predates this field', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(response.body.data).not.toHaveProperty('orderNumber');
    });

    it('publishes the order number frozen at creation', async () => {
        const { bearer, user } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            orderNumber: '2026-000041'
        });

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response).toSatisfyApiSpec();
        expect(response.body.data.orderNumber).toBe('2026-000041');
    });
});
