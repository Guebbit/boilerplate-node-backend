/**
 * @module
 * Contract tests for /returns over real HTTP — every response is judged against the spec
 * automatically (`@tests/contract`). Pins that each contract branch is reached: the 201 with its
 * `Location`, the 200 that is a cancelled order rather than a return, the staff decisions, and the
 * refusals a client acts on.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';

setupTestDb();

/** A customer logged in, with one order in `status`. */
const customerWithOrder = async (status: OrderStatus) => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct({ price: 20 });
    const order = await createOrder(user, [toOrderItem(product, 2)], { status });
    return { bearer, orderId: String(order._id), productId: String(product._id) };
};

describe('POST /returns', () => {
    it('opens a withdrawal on shipped goods: 201, Location, and a return born approved', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.shipped);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal' });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/returns/${String(response.body.data.id)}`);
        expect(response.body.data).toMatchObject({
            status: 'approved',
            reason: 'withdrawal',
            orderId
        });
        expect(response.body.data.actions).toEqual({
            approve: false,
            decline: false,
            receive: false
        });
    });

    it('cancels the order for a withdrawal before dispatch: 200 with the Order, not a Return', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.paid);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ id: orderId, status: 'cancelled' });
        expect(response.body.data.actions.withdraw).toBe(false);
    });

    it('refuses more units than the order held with 422 RETURN_LINES_INVALID', async () => {
        const { bearer, orderId, productId } = await customerWithOrder(OrderStatus.delivered);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'defective', lines: [{ productId, quantity: 9 }] });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('RETURN_LINES_INVALID');
    });

    it('refuses a cancelled order with 409 RETURN_ORDER_NOT_RETURNABLE', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.cancelled);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal' });

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('RETURN_ORDER_NOT_RETURNABLE');
    });

    it('answers 404 for an order that is not the caller’s', async () => {
        const { orderId } = await customerWithOrder(OrderStatus.shipped);
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal' });

        expect(response.status).toBe(404);
    });

    it('rejects a body with an unknown field with 422', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.shipped);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal', refundAmount: 1 });

        expect(response.status).toBe(422);
    });

    it('requires a session', async () => {
        const response = await api().post('/returns').send({});

        expect(response.status).toBe(401);
    });
});

describe('GET /returns and GET /returns/{id}', () => {
    it('lists the caller’s own returns, and serves one by id', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.delivered);
        const created = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'defective', note: 'Cracked' });

        const list = await api().get('/returns').query({ orderId }).set('Authorization', bearer);
        const one = await api()
            .get(`/returns/${String(created.body.data.id)}`)
            .set('Authorization', bearer);

        expect(list.status).toBe(200);
        expect(list.body.data.items).toHaveLength(1);
        expect(one.status).toBe(200);
        expect(one.body.data.note).toBe('Cracked');
    });

    it('404s a return on someone else’s order', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.delivered);
        const created = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'defective' });
        const { bearer: strangerBearer } = await authenticateAsRole('customer');

        const response = await api()
            .get(`/returns/${String(created.body.data.id)}`)
            .set('Authorization', strangerBearer);

        expect(response.status).toBe(404);
    });
});

/** A `requested` return, and a manager to decide it. */
const requested = async () => {
    const { bearer, orderId } = await customerWithOrder(OrderStatus.delivered);
    const created = await api()
        .post('/returns')
        .set('Authorization', bearer)
        .send({ orderId, reason: 'defective' });
    const { bearer: manager } = await authenticateAsRole('manager');
    return { customer: bearer, manager, id: String(created.body.data.id) };
};

describe('POST /returns/{id}/approve and /decline', () => {
    it('approves with 200, and a second decision loses with 409', async () => {
        const { manager, id } = await requested();

        const first = await api().post(`/returns/${id}/approve`).set('Authorization', manager);
        const second = await api()
            .post(`/returns/${id}/decline`)
            .set('Authorization', manager)
            .send({ reason: 'Too late' });

        expect(first.status).toBe(200);
        expect(first.body.data.status).toBe('approved');
        expect(second.status).toBe(409);
        expect(second.body.errors[0].code).toBe('RETURN_NOT_DECIDABLE');
    });

    it('declines with a reason: 200', async () => {
        const { manager, id } = await requested();

        const response = await api()
            .post(`/returns/${id}/decline`)
            .set('Authorization', manager)
            .send({ reason: 'Worn' });

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ status: 'declined', declineReason: 'Worn' });
    });

    it('requires a reason to decline: 422', async () => {
        const { manager, id } = await requested();

        const response = await api()
            .post(`/returns/${id}/decline`)
            .set('Authorization', manager)
            .send({});

        expect(response.status).toBe(422);
    });

    it('is forbidden to the customer', async () => {
        const { customer, id } = await requested();

        const response = await api().post(`/returns/${id}/approve`).set('Authorization', customer);

        expect(response.status).toBe(403);
    });

    it('answers 404 for a return that does not exist', async () => {
        const { bearer } = await authenticateAsRole('manager');

        const response = await api()
            .post(`/returns/${'a'.repeat(24)}/approve`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});
