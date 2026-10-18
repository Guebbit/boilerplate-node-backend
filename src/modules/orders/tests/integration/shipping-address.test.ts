/**
 * @module
 * Staff correcting where an unshipped order ships (`PUT /orders/{id}/shipping-address`): the new
 * address replaces the old one under the order's own encryption, the history names who and never
 * what, and it stops being possible the moment something ships.
 *
 * See: docs/modules/orders.md#correcting-the-shipping-address
 */

import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { OrderStatus } from '@types';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderModel } from '../../model';

setupTestDb();

const BEFORE = {
    fullName: 'Ada Lovelace',
    street: '12 Analytical Engine Rd',
    city: 'London',
    zip: 'SW1A',
    country: 'GB'
};
const AFTER = { ...BEFORE, street: '14 Analytical Engine Rd', zip: 'SW1B' };

/** A paid order shipping to {@link BEFORE}. */
const seedPaidOrder = async (status: OrderStatus = OrderStatus.paid) => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status,
        shippingAddress: BEFORE
    });
    return { order, buyer: bearer };
};

describe('PUT /orders/{id}/shipping-address', () => {
    it('replaces the address for staff, encrypted, and says who in the timeline, not what', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .put(`/orders/${String(order._id)}/shipping-address`)
            .set('Authorization', bearer)
            .send(AFTER);

        expect(response.status).toBe(200);
        expect(response.body.data.shippingAddress).toMatchObject(AFTER);
        const raw = JSON.stringify(await orderModel.collection.findOne({ _id: order._id }));
        expect(raw).not.toContain('14 Analytical');
        const timeline = await api()
            .get(`/orders/${String(order._id)}/timeline`)
            .set('Authorization', bearer);
        expect(JSON.stringify(timeline.body)).toContain('address_corrected');
        expect(JSON.stringify(timeline.body)).not.toContain('Analytical');
    });

    it('shows the buyer the new address on the order, and no row about the change', async () => {
        const { order, buyer } = await seedPaidOrder();
        const { bearer: staff } = await authenticateAsRole('admin');
        await api()
            .put(`/orders/${String(order._id)}/shipping-address`)
            .set('Authorization', staff)
            .send(AFTER);

        const read = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', buyer);
        const timeline = await api()
            .get(`/orders/${String(order._id)}/timeline`)
            .set('Authorization', buyer);

        expect(read.body.data.shippingAddress).toMatchObject(AFTER);
        expect(JSON.stringify(timeline.body)).not.toContain('address_corrected');
    });

    it('offers the correction to staff in `actions`, and refuses it once the order has shipped', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');
        const read = () =>
            api()
                .get(`/orders/${String(order._id)}`)
                .set('Authorization', bearer)
                .then((response) => response.body.data.actions.correctAddress as boolean);

        expect(await read()).toBe(true);

        await orderModel.updateOne({ _id: order._id }, { 'fulfillment.shipped': true }).exec();

        expect(await read()).toBe(false);
        const refused = await api()
            .put(`/orders/${String(order._id)}/shipping-address`)
            .set('Authorization', bearer)
            .send(AFTER);
        expect(refused.status).toBe(409);
        expect(refused.body.errors[0].code).toBe('ORDER_ADDRESS_LOCKED');
    });

    it('refuses an order with no shipping address to redirect', async () => {
        const { user } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .put(`/orders/${String(order._id)}/shipping-address`)
            .set('Authorization', bearer)
            .send(AFTER);

        expect(response.status).toBe(409);
    });

    it('is staff’s: the buyer is refused, and an unknown order is a 404', async () => {
        const { order, buyer } = await seedPaidOrder();
        const { bearer: staff } = await authenticateAsRole('admin');

        const byBuyer = await api()
            .put(`/orders/${String(order._id)}/shipping-address`)
            .set('Authorization', buyer)
            .send(AFTER);
        const missing = await api()
            .put('/orders/64b0000000000000000000aa/shipping-address')
            .set('Authorization', staff)
            .send(AFTER);

        expect(byBuyer.status).toBe(403);
        expect(missing.status).toBe(404);
    });

    it('refuses an incomplete address', async () => {
        const { order } = await seedPaidOrder();
        const { bearer } = await authenticateAsRole('admin');

        const response = await api()
            .put(`/orders/${String(order._id)}/shipping-address`)
            .set('Authorization', bearer)
            .send({ fullName: 'Ada' });

        expect(response.status).toBe(422);
    });
});
