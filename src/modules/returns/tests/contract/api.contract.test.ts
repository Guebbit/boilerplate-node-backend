/**
 * @module
 * Contract tests for /returns over real HTTP — every response is judged against the spec
 * automatically (`@tests/contract`). Pins that each contract branch is reached: the 201 with its
 * `Location`, the withdrawal before dispatch that is a closed return, the staff decisions, and the
 * refusals a client acts on.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole, loginBearer, staleBearerFor } from '@tests/http';
import { createUser } from '@modules/users/tests/factories';
import type { UserDocument } from '@modules/users';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { carryOrderTo, fulfillmentOrdersOf } from '@modules/delivery/tests/factories';
import { shipFulfillmentOrder } from '@modules/delivery';
import { asAdmin, callerContextAs } from '@tests/callers';
import { OrderStatus } from '@types';
import { returnRepository } from '../../repository';

setupTestDb();

/** A customer logged in, with one order in `status`. */
const customerWithOrder = async (status: OrderStatus) => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct({ price: 20 });
    const carried = status === OrderStatus.shipped || status === OrderStatus.delivered;
    const order = await createOrder(user, [toOrderItem(product, 2)], {
        status: carried ? OrderStatus.processing : status
    });
    // Goods that left or arrived got there through the real doors, so the shipments exist.
    if (carried) await carryOrderTo(String(order._id), status);
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

    it('cancels the order for a withdrawal before dispatch: 201, Location, and a return born closed', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.paid);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal' });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/returns/${String(response.body.data.id)}`);
        expect(response.body.data).toMatchObject({
            status: 'closed',
            reason: 'withdrawal',
            orderId,
            lines: []
        });
        expect(response.body.data.actions).toEqual({
            approve: false,
            decline: false,
            receive: false
        });

        const order = await api().get(`/orders/${orderId}`).set('Authorization', bearer);
        expect(order.body.data).toMatchObject({ status: 'cancelled' });
        expect(order.body.data.actions.withdraw).toBe(false);
    });

    it('lists the withdrawal on the order afterwards, which is how the order page shows it', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.processing);
        await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal' });

        const list = await api().get('/returns').query({ orderId }).set('Authorization', bearer);

        expect(list.status).toBe(200);
        expect(list.body.data.items).toHaveLength(1);
        expect(list.body.data.items[0]).toMatchObject({ status: 'closed', reason: 'withdrawal' });
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

    it('refuses a request that names the shop’s own reason, no_answer, with 422', async () => {
        const { bearer, orderId } = await customerWithOrder(OrderStatus.delivered);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'no_answer' });

        expect(response.status).toBe(422);
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

/** A staff account with a verified address, distinct per call, whose session a test can age. */
let staffAccounts = 0;
const staffUser = (role: string) => {
    staffAccounts += 1;
    return createUser(
        { email: `${role}-${staffAccounts}@example.com`, verifiedAt: new Date() },
        role
    );
};

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

/** A withdrawal on a delivered order, and the warehouse account that receives it. */
const withdrawn = async () => {
    const { bearer, orderId } = await customerWithOrder(OrderStatus.delivered);
    const created = await api()
        .post('/returns')
        .set('Authorization', bearer)
        .send({ orderId, reason: 'withdrawal' });
    const { bearer: warehouse } = await authenticateAsRole('warehouse');
    return { customer: bearer, warehouse, id: String(created.body.data.id) };
};

describe('POST /returns/{id}/receive', () => {
    it('records the goods arriving: 200, and the return moves on', async () => {
        const { warehouse, id } = await withdrawn();

        const response = await api()
            .post(`/returns/${id}/receive`)
            .set('Authorization', warehouse)
            .send({});

        expect(response.status).toBe(200);
        // No payment stands behind a hand-built fixture order, so there is nothing to wait for.
        expect(response.body.data.status).toBe('closed');
        expect(response.body.data.receivedAt).toEqual(expect.any(String));
    });

    // `receive:Return` carries `stepUp: critical` on the key: receiving pays the customer back.
    describe('with a session past the critical window', () => {
        afterEach(() => jest.useRealTimers());

        it('answers 401 REAUTH_REQUIRED and leaves the return awaiting its goods', async () => {
            const { id } = await withdrawn();
            const stale = await staleBearerFor(await staffUser('warehouse'), 'critical');

            const response = await api().post(`/returns/${id}/receive`).set('Authorization', stale);

            expect(response.status).toBe(401);
            expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
            const stored = await returnRepository.findById(id);
            expect(stored?.status).toBe('approved');
            expect(stored?.receivedAt).toBeUndefined();
        });
    });

    it('takes no body at all', async () => {
        const { warehouse, id } = await withdrawn();

        const response = await api().post(`/returns/${id}/receive`).set('Authorization', warehouse);

        expect(response.status).toBe(200);
    });

    it('answers 409 RETURN_NOT_RECEIVABLE for a second receipt', async () => {
        const { warehouse, id } = await withdrawn();
        await api().post(`/returns/${id}/receive`).set('Authorization', warehouse);

        const response = await api().post(`/returns/${id}/receive`).set('Authorization', warehouse);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('RETURN_NOT_RECEIVABLE');
    });

    it('refuses a deduction the refund cannot bear with 422 RETURN_DEDUCTION_INVALID', async () => {
        const { warehouse, id } = await withdrawn();

        const response = await api()
            .post(`/returns/${id}/receive`)
            .set('Authorization', warehouse)
            .send({ handlingDeduction: 1_000_000 });

        expect(response.status).toBe(422);
        expect(response.body.errors[0]).toMatchObject({
            code: 'RETURN_DEDUCTION_INVALID',
            details: { field: 'handlingDeduction' }
        });
    });

    it('is forbidden to the customer and to a role that only decides', async () => {
        const { customer, id } = await withdrawn();
        const { bearer: support } = await authenticateAsRole('support');

        const asCustomer = await api()
            .post(`/returns/${id}/receive`)
            .set('Authorization', customer);
        const asSupport = await api().post(`/returns/${id}/receive`).set('Authorization', support);

        expect(asCustomer.status).toBe(403);
        expect(asSupport.status).toBe(403);
    });

    it('answers 404 for a return that does not exist', async () => {
        const { bearer } = await authenticateAsRole('warehouse');

        const response = await api()
            .post(`/returns/${'a'.repeat(24)}/receive`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

/**
 * A customer logged in, with a `processing` order of two products of which only the first has
 * shipped — so the second is a remainder waiting to be cancelled.
 */
const customerWithPartlyShippedOrder = async () => {
    const { user, bearer } = await authenticateAs('user');
    return { bearer, ...(await partlyShippedFor(user)) };
};

/** The same order for an account that already exists — a staff member shopping as a customer. */
const partlyShippedFor = async (user: UserDocument) => {
    const shipped = await createProduct({ price: 20 });
    const waiting = await createProduct({ price: 5 });
    const order = await createOrder(user, [toOrderItem(shipped, 1), toOrderItem(waiting, 2)], {
        status: OrderStatus.processing
    });
    const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
    await shipFulfillmentOrder(
        String(fulfillmentOrder._id),
        { lines: [{ productId: String(shipped._id), quantity: 1 }] },
        asAdmin(),
        callerContextAs('admin')
    );
    return {
        orderId: String(order._id),
        fulfillmentOrderId: String(fulfillmentOrder._id),
        waitingId: String(waiting._id)
    };
};

describe('GET /returns/options', () => {
    it('matches the contract: what can be returned, and what a cancel would refund', async () => {
        const { bearer, orderId, fulfillmentOrderId, waitingId } =
            await customerWithPartlyShippedOrder();

        const response = await api()
            .get('/returns/options')
            .query({ orderId })
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({
            orderId,
            currency: 'EUR',
            returnable: [{ quantity: 1 }],
            cancellable: [
                {
                    fulfillmentOrderId,
                    number: 1,
                    lines: [{ productId: waitingId, quantity: 2 }],
                    refundAmount: 10,
                    shippingRefund: 0
                }
            ]
        });
    });

    it('answers 404 for an order that is not the caller’s, and 422 without an orderId', async () => {
        const { orderId } = await customerWithPartlyShippedOrder();
        const { bearer } = await authenticateAsRole('customer');

        const stranger = await api()
            .get('/returns/options')
            .query({ orderId })
            .set('Authorization', bearer);
        const missing = await api().get('/returns/options').set('Authorization', bearer);

        expect(stranger.status).toBe(404);
        expect(missing.status).toBe(422);
    });
});

describe('POST /returns — kind: cancellation', () => {
    it('matches the contract: 201, Location, and a return born closed with the remainder as its lines', async () => {
        const { bearer, orderId, fulfillmentOrderId, waitingId } =
            await customerWithPartlyShippedOrder();

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal', kind: 'cancellation', fulfillmentOrderId });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/returns/${String(response.body.data.id)}`);
        expect(response.body.data).toMatchObject({
            kind: 'cancellation',
            status: 'closed',
            fulfillmentOrderId,
            lines: [{ productId: waitingId, quantity: 2 }],
            refundAmount: 10
        });
        // The order moved on with it: nothing remains, one shipment is still out.
        const order = await api().get(`/orders/${orderId}`).set('Authorization', bearer);
        expect(order.body.data).toMatchObject({ status: 'shipped', fulfillmentStatus: 'shipped' });
    });

    it('refuses a cancellation that names no fulfillment order with 422 RETURN_CANCELLATION_INVALID', async () => {
        const { bearer, orderId } = await customerWithPartlyShippedOrder();

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal', kind: 'cancellation' });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('RETURN_CANCELLATION_INVALID');
    });

    it('refuses a second cancel of the same remainder with 409 RETURN_NOTHING_TO_CANCEL', async () => {
        const { bearer, orderId, fulfillmentOrderId } = await customerWithPartlyShippedOrder();
        const cancel = () =>
            api()
                .post('/returns')
                .set('Authorization', bearer)
                .send({ orderId, reason: 'withdrawal', kind: 'cancellation', fulfillmentOrderId });
        await cancel();

        const again = await cancel();

        expect(again.status).toBe(409);
        expect(again.body.errors[0].code).toBe('RETURN_NOTHING_TO_CANCEL');
    });

    it('lets staff holding the refund key cancel a customer’s remainder, and refuses the warehouse', async () => {
        const { orderId, fulfillmentOrderId } = await customerWithPartlyShippedOrder();
        const { bearer: warehouse } = await authenticateAsRole('warehouse');
        const { bearer: moderator } = await authenticateAsRole('moderator');
        const body = { orderId, reason: 'other', kind: 'cancellation', fulfillmentOrderId };

        const refused = await api().post('/returns').set('Authorization', warehouse).send(body);
        const allowed = await api().post('/returns').set('Authorization', moderator).send(body);

        expect(refused.status).toBe(403);
        expect(allowed.status).toBe(201);
        expect(allowed.body.data).toMatchObject({ kind: 'cancellation', reason: 'other' });
    });
});

/** A moderator account (holds the refund key), and what the order it may cancel looks like. */
const staleModerator = async () => {
    const moderator = await staffUser('moderator');
    return { moderator, bearer: await staleBearerFor(moderator, 'critical') };
};

/** Whether the remainder is still waiting: nothing cancelled, nothing refunded. */
const stillWaiting = (orderId: string) =>
    fulfillmentOrdersOf(orderId).then(([first]) => first.status === 'in_progress');

describe('POST /returns — a staff cancellation asks a fresh session, the buyer’s withdrawal never does', () => {
    afterEach(() => jest.useRealTimers());

    it('answers a stale staff cancellation 401 REAUTH_REQUIRED, and cancels nothing', async () => {
        const { orderId, fulfillmentOrderId } = await customerWithPartlyShippedOrder();
        const { bearer } = await staleModerator();

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'other', kind: 'cancellation', fulfillmentOrderId });

        expect(response.status).toBe(401);
        expect(response.body.errors[0].code).toBe('REAUTH_REQUIRED');
        expect(await stillWaiting(orderId)).toBe(true);
    });

    // The ledger records any JSON answer: the 401 must be refused before it, or the same key would
    // replay it after the staff member has re-authenticated.
    it('lets the same Idempotency-Key through once the staff member has re-authenticated', async () => {
        const { orderId, fulfillmentOrderId } = await customerWithPartlyShippedOrder();
        const { moderator, bearer: stale } = await staleModerator();
        const send = (bearer: string) =>
            api()
                .post('/returns')
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'staff-cancel-key-1')
                .send({ orderId, reason: 'other', kind: 'cancellation', fulfillmentOrderId });

        const challenged = await send(stale);
        const retried = await send(await loginBearer(moderator.email));

        expect(challenged.status).toBe(401);
        expect(retried.status).toBe(201);
        expect(retried.headers['idempotent-replay']).toBeUndefined();
    });

    it('refuses staff naming withdrawal on a stranger’s order with 422, never 201', async () => {
        const { orderId, fulfillmentOrderId } = await customerWithPartlyShippedOrder();
        const { bearer } = await staleModerator();

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal', kind: 'cancellation', fulfillmentOrderId });

        // The exemption from the step-up buys nothing: the reason is the buyer's own right.
        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('RETURN_CANCELLATION_INVALID');
        expect(await stillWaiting(orderId)).toBe(true);
    });

    it('never prompts a staff member withdrawing from their own order', async () => {
        const moderator = await staffUser('moderator');
        const bearer = await staleBearerFor(moderator, 'critical');
        const { orderId, fulfillmentOrderId } = await partlyShippedFor(moderator);

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, reason: 'withdrawal', kind: 'cancellation', fulfillmentOrderId });

        expect(response.status).toBe(201);
        expect(response.body.data).toMatchObject({ reason: 'withdrawal', kind: 'cancellation' });
    });

    it.each([
        ['an array reason', { reason: ['withdrawal'] }],
        ['no reason', {}],
        ['a reason in the wrong case', { reason: 'WITHDRAWAL' }],
        ['a kind in the wrong case', { reason: 'other', kind: 'Cancellation' }]
    ])('never lets %s from a stale staff session cancel anything', async (_name, overrides) => {
        const { orderId, fulfillmentOrderId } = await customerWithPartlyShippedOrder();
        const { bearer } = await staleModerator();

        const response = await api()
            .post('/returns')
            .set('Authorization', bearer)
            .send({ orderId, kind: 'cancellation', fulfillmentOrderId, ...overrides });

        expect(response.status).not.toBe(201);
        expect(await stillWaiting(orderId)).toBe(true);
    });
});
