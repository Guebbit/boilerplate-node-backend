/**
 * @module
 * Contract tests for /delivery over real HTTP — every response is judged against the spec
 * automatically (`@tests/contract`). Ten routes, three audiences: the methods list is public, the
 * fulfilment read is the owner's, the write doors are staff's. These pin that each contract
 * branch is reached over HTTP; the acts' own rules live in the unit and integration suites.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import {
    api,
    authenticateAs,
    authenticateAsRole,
    bearerForCookie,
    loginCompleting
} from '@tests/http';
import { MISSING_ID } from '@tests/ids';
import { setCookie } from '@tests/cookies';
import { freezeDate, advanceDate } from '@tests/clock';
import { createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    readOrder,
    toOrderItem
} from '@modules/orders/tests/factories';
import {
    fulfillmentOrdersOf,
    paidBackorderOrder,
    paidPreorderOrder,
    shipEverything,
    shipmentsOf
} from '@modules/delivery/tests/factories';
import { reauthWindowSeconds } from '@kernel/config';
import { OrderStatus } from '@types';

setupTestDb();

/** A customer logged in with one order already shipped (one shipment, 1 of 1 unit). */
const authenticateWithShipment = async () => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.processing
    });
    await shipEverything(String(order._id), { trackingCode: 'TRK-CONTRACT1' });
    return { bearer, order };
};

/** A processing order of `quantity` units of one product, for the admin who is logged in. */
const adminWithOrder = async (quantity = 1, extras = {}) => {
    const { user, bearer } = await authenticateAs('admin');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, quantity)], {
        status: OrderStatus.processing,
        ...extras
    });
    const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
    return {
        bearer,
        orderId: String(order._id),
        fulfillmentOrderId: String(fulfillmentOrder._id),
        productId: String(product._id)
    };
};

describe('GET /delivery/methods', () => {
    it('matches the contract, unauthenticated included — rates are pre-purchase information', async () => {
        const response = await api().get('/delivery/methods');

        expect(response.status).toBe(200);
        expect(response.body.methods.length).toBeGreaterThan(0);
    });

    it('lists every method regardless of a query string trying to filter it', async () => {
        // `?weight=` was dropped: the list is a catalogue now, unfiltered. A query param a
        // caller still sends must not silently change the response shape.
        const response = await api().get('/delivery/methods').query({ weight: 10_000 });

        expect(response.status).toBe(200);
        const ids = (response.body.methods as { id: string }[]).map(({ id }) => id);
        expect(ids).toContain('standard');
        expect(ids).toContain('express');
    });

    // Every method carries the shop's own currency — the frontend reads it here rather
    // than guessing a fixed default.
    it('stamps every method with the shop currency', async () => {
        const response = await api().get('/delivery/methods');

        const currencies = (response.body.methods as { currency: string }[]).map(
            ({ currency }) => currency
        );
        expect(currencies.every((currency) => currency === 'EUR')).toBe(true);
    });
});

describe('GET /orders/{id}/fulfillment-orders and /shipments', () => {
    it('match the contract for the caller’s own fulfilment: two lists, each item with its actions', async () => {
        const { bearer, order } = await authenticateWithShipment();

        const plan = await api()
            .get(`/orders/${String(order._id)}/fulfillment-orders`)
            .set('Authorization', bearer);
        const left = await api()
            .get(`/orders/${String(order._id)}/shipments`)
            .set('Authorization', bearer);

        expect(plan.status).toBe(200);
        expect(plan.body.items).toHaveLength(1);
        expect(plan.body.items[0]).toMatchObject({ number: 1, kind: 'physical', status: 'closed' });
        expect(left.status).toBe(200);
        expect(left.body.items).toHaveLength(1);
        expect(left.body.items[0]).toMatchObject({
            number: 1,
            status: 'shipped',
            trackingCode: 'TRK-CONTRACT1'
        });
        // The buyer sees their goods, and nothing they could act on as staff.
        expect(left.body.items[0].actions).toEqual({
            deliver: false,
            update: false,
            markLost: false
        });
    });

    it('answer an empty list for an order that is not paid yet — absence is the answer', async () => {
        const { user, bearer } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const plan = await api()
            .get(`/orders/${String(order._id)}/fulfillment-orders`)
            .set('Authorization', bearer);
        const left = await api()
            .get(`/orders/${String(order._id)}/shipments`)
            .set('Authorization', bearer);

        expect(plan.status).toBe(200);
        expect(plan.body).toEqual({ items: [] });
        expect(left.status).toBe(200);
        expect(left.body).toEqual({ items: [] });
    });

    it('serves staff the actions they may take, and the hold note only to them', async () => {
        const { bearer, orderId, fulfillmentOrderId } = await adminWithOrder();
        await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/hold`)
            .set('Authorization', bearer)
            .send({ reason: 'high_risk', note: 'call first' });

        const response = await api()
            .get(`/orders/${orderId}/fulfillment-orders`)
            .set('Authorization', bearer);

        expect(response.body.items[0]).toMatchObject({
            status: 'on_hold',
            holdReason: 'high_risk',
            holdNote: 'call first',
            actions: { ship: false, fulfill: false, hold: false, release: true }
        });
    });

    it('keeps the hold note from the buyer, who still sees their order is held', async () => {
        const { bearer: customer, user } = await authenticateAs('user');
        const { bearer: admin } = await authenticateAs('admin');
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/hold`)
            .set('Authorization', admin)
            .send({ reason: 'high_risk', note: 'call first' });

        const response = await api()
            .get(`/orders/${String(order._id)}/fulfillment-orders`)
            .set('Authorization', customer);

        expect(response.status).toBe(200);
        expect(response.body.items[0].status).toBe('on_hold');
        expect(response.body.items[0]).not.toHaveProperty('holdNote');
    });

    it('answer 404 for another customer’s order, on both lists', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAsRole('customer');

        const plan = await api()
            .get(`/orders/${String(order._id)}/fulfillment-orders`)
            .set('Authorization', bearer);
        const left = await api()
            .get(`/orders/${String(order._id)}/shipments`)
            .set('Authorization', bearer);

        expect(plan.status).toBe(404);
        expect(left.status).toBe(404);
    });

    it('answer 401 with no token, and 404 for a malformed id', async () => {
        const { bearer } = await authenticateAs('user');

        const anonymous = await api().get('/orders/000000000000000000000000/shipments');
        const malformed = await api()
            .get('/orders/not-an-id/fulfillment-orders')
            .set('Authorization', bearer);

        expect(anonymous.status).toBe(401);
        expect(malformed.status).toBe(404);
    });
});

describe('POST /orders/{orderId}/process', () => {
    it('matches the contract and moves a paid order to processing', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });

        const response = await api()
            .post(`/orders/${String(order._id)}/process`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('processing');
        // Starting made the fulfillment orders too: the warehouse can ship straight away.
        expect(await fulfillmentOrdersOf(String(order._id))).toHaveLength(1);
    });

    it('matches the error contract for an order that is not paid', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .post(`/orders/${String(order._id)}/process`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('ORDER_NOT_PAID');
    });
});

describe('POST /delivery/fulfillment-orders/{id}/shipments', () => {
    it('matches the contract: 201 with a Location, and the order moves to shipped', async () => {
        const { bearer, orderId, fulfillmentOrderId } = await adminWithOrder();

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/shipments`)
            .set('Authorization', bearer)
            .send({ trackingCode: 'TRK-SHIPDOOR1' });

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/delivery/shipments/${String(response.body.id)}`);
        expect(response.body).toMatchObject({
            number: 1,
            status: 'shipped',
            trackingCode: 'TRK-SHIPDOOR1',
            fulfillmentOrderId
        });
        expect(await readOrder(orderId).then((one) => one?.status)).toBe(OrderStatus.shipped);
    });

    it('ships only the named lines, and leaves the order processing', async () => {
        const { bearer, orderId, fulfillmentOrderId, productId } = await adminWithOrder(3);

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/shipments`)
            .set('Authorization', bearer)
            .send({ lines: [{ productId, quantity: 1 }] });

        expect(response.status).toBe(201);
        expect(response.body.lines).toEqual([expect.objectContaining({ productId, quantity: 1 })]);
        expect(await readOrder(orderId).then((one) => one?.status)).toBe(OrderStatus.processing);
        const read = await api().get(`/orders/${orderId}`).set('Authorization', bearer);
        expect(read.body.fulfillmentStatus).toBe('partially_fulfilled');
    });

    it('ships a tracked method with no code yet, and says it is waiting for one', async () => {
        const { bearer, fulfillmentOrderId } = await adminWithOrder(1, {
            shippingMethod: 'express'
        });

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/shipments`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(201);
        expect(response.body.trackingCode).toBeUndefined();
        expect(response.body.awaitingTracking).toBe(true);
    });

    it('matches the error contract for more units than remain', async () => {
        const { bearer, fulfillmentOrderId, productId } = await adminWithOrder(1);

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/shipments`)
            .set('Authorization', bearer)
            .send({ lines: [{ productId, quantity: 2 }] });

        expect(response.status).toBe(422);
        expect(response.body.errors[0].code).toBe('DELIVERY_LINES_INVALID');
    });

    it('matches the error contract for a digital fulfillment order — nothing here would ride in a parcel', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('DELIVERY_NOT_PHYSICAL');
    });

    it('replays a retried partial ship under the same Idempotency-Key: one shipment, one stock draw', async () => {
        const { bearer, orderId, fulfillmentOrderId, productId } = await adminWithOrder(3);
        const ship = () =>
            api()
                .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/shipments`)
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'ship-two-of-three')
                .send({ lines: [{ productId, quantity: 2 }] });

        const first = await ship();
        const retry = await ship();

        expect(first.status).toBe(201);
        expect(retry.status).toBe(201);
        expect(retry.headers['idempotent-replay']).toBe('true');
        expect(retry.headers.location).toBe(first.headers.location);
        expect(retry.body.id).toBe(first.body.id);
        expect(await shipmentsOf(orderId)).toHaveLength(1);
    });

    it('refuses the same key reused for another body with 422', async () => {
        const { bearer, fulfillmentOrderId, productId } = await adminWithOrder(3);
        const ship = (quantity: number) =>
            api()
                .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/shipments`)
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'one-key-two-bodies')
                .send({ lines: [{ productId, quantity }] });

        await ship(1);
        const reused = await ship(2);

        expect(reused.status).toBe(422);
    });

    it('answers 404 to an id that is not a fulfillment order', async () => {
        const { bearer } = await authenticateAs('admin');

        const missing = await api()
            .post(`/delivery/fulfillment-orders/${MISSING_ID}/shipments`)
            .set('Authorization', bearer)
            .send({});

        expect(missing.status).toBe(404);
    });
});

describe('POST /delivery/fulfillment-orders/{id}/fulfill', () => {
    it('matches the contract and delivers a digital-only order in one act', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(201);
        expect(response.headers.location).toBe(`/delivery/shipments/${String(response.body.id)}`);
        expect(response.body).toMatchObject({ status: 'delivered', number: 1 });
        expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
            OrderStatus.delivered
        );
        // The shipment is born delivered and never carried a tracking code.
        expect(
            await shipmentsOf(String(order._id)).then(([first]) => first.trackingCode)
        ).toBeUndefined();
    });

    it('replays a retried fulfil under the same Idempotency-Key', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        const fulfil = () =>
            api()
                .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/fulfill`)
                .set('Authorization', bearer)
                .set('Idempotency-Key', 'fulfil-once');

        const first = await fulfil();
        const retry = await fulfil();

        expect(retry.status).toBe(201);
        expect(retry.headers['idempotent-replay']).toBe('true');
        expect(retry.body.id).toBe(first.body.id);
    });

    it('matches the error contract for a fulfillment order that still has a physical line', async () => {
        const { bearer, fulfillmentOrderId } = await adminWithOrder();

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('DELIVERY_NOT_DIGITAL');
    });

    it('matches the error contract for a digital-only order that is already shipped', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.paid
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        await forceOrderStatus(String(order._id), OrderStatus.shipped);

        const response = await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('ORDER_NOT_PROCESSING');
    });
});

describe('POST /delivery/fulfillment-orders/{id}/hold and /release', () => {
    it('holds, refuses a second hold, releases, and refuses a second release', async () => {
        const { bearer, fulfillmentOrderId } = await adminWithOrder();
        const hold = (reason: string) =>
            api()
                .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/hold`)
                .set('Authorization', bearer)
                .send({ reason });
        const release = () =>
            api()
                .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/release`)
                .set('Authorization', bearer);

        const held = await hold('incorrect_address');
        const heldAgain = await hold('other');
        const released = await release();
        const releasedAgain = await release();

        expect(held.status).toBe(200);
        expect(held.body).toMatchObject({
            status: 'on_hold',
            holdReason: 'incorrect_address'
        });
        expect(heldAgain.status).toBe(409);
        expect(heldAgain.body.errors[0].code).toBe('DELIVERY_NOT_HOLDABLE');
        expect(released.status).toBe(200);
        expect(released.body.status).toBe('open');
        expect(releasedAgain.status).toBe(409);
        expect(releasedAgain.body.errors[0].code).toBe('DELIVERY_NOT_RELEASABLE');
    });

    it('refuses a reason staff may not give — only the allocation of stock holds for stock', async () => {
        const { bearer, fulfillmentOrderId } = await adminWithOrder();

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/hold`)
            .set('Authorization', bearer)
            .send({ reason: 'awaiting_stock' });

        expect(response.status).toBe(422);
    });
});

describe('GET /delivery/shipments/{id}', () => {
    it('reads the buyer’s own shipment', async () => {
        const { bearer, order } = await authenticateWithShipment();
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .get(`/delivery/shipments/${String(shipment._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            id: String(shipment._id),
            trackingCode: 'TRK-CONTRACT1'
        });
    });

    it('lets staff holding display:Order read any shipment', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .get(`/delivery/shipments/${String(shipment._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('answers 404, never 403, for another buyer’s shipment', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer: other } = await authenticateAsRole('customer');
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .get(`/delivery/shipments/${String(shipment._id)}`)
            .set('Authorization', other);

        expect(response.status).toBe(404);
    });

    it('answers 404 for an unknown id and a malformed one', async () => {
        const { bearer } = await authenticateAs('admin');

        const unknown = await api()
            .get(`/delivery/shipments/${MISSING_ID}`)
            .set('Authorization', bearer);
        const malformed = await api()
            .get('/delivery/shipments/not-an-id')
            .set('Authorization', bearer);

        expect([unknown.status, malformed.status]).toEqual([404, 404]);
    });

    it('refuses an anonymous caller with 401', async () => {
        const response = await api().get(`/delivery/shipments/${MISSING_ID}`);

        expect(response.status).toBe(401);
    });
});

describe('GET /delivery/fulfillment-orders/{id}', () => {
    it('reads the buyer’s own fulfillment order', async () => {
        const { bearer, order } = await authenticateWithShipment();
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .get(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({ id: String(fulfillmentOrder._id) });
    });

    it('lets staff holding display:Order read any fulfillment order', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .get(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });

    it('answers 404, never 403, for another buyer’s fulfillment order', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer: other } = await authenticateAsRole('customer');
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .get(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}`)
            .set('Authorization', other);

        expect(response.status).toBe(404);
    });

    it('answers 404 for an unknown id and a malformed one', async () => {
        const { bearer } = await authenticateAs('admin');

        const unknown = await api()
            .get(`/delivery/fulfillment-orders/${MISSING_ID}`)
            .set('Authorization', bearer);
        const malformed = await api()
            .get('/delivery/fulfillment-orders/not-an-id')
            .set('Authorization', bearer);

        expect([unknown.status, malformed.status]).toEqual([404, 404]);
    });

    it('refuses an anonymous caller with 401', async () => {
        const response = await api().get(`/delivery/fulfillment-orders/${MISSING_ID}`);

        expect(response.status).toBe(401);
    });
});

describe('PATCH /delivery/shipments/{id}', () => {
    it('corrects a tracking code, in JSON or as a merge patch, while the shipment is out', async () => {
        const { bearer: customer, order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));

        const json = await api()
            .patch(`/delivery/shipments/${String(shipment._id)}`)
            .set('Authorization', bearer)
            .send({ trackingCode: 'TRK-FIXED001' });
        const merge = await api()
            .patch(`/delivery/shipments/${String(shipment._id)}`)
            .set('Authorization', bearer)
            .set('Content-Type', 'application/merge-patch+json')
            .send(JSON.stringify({ trackingCode: 'TRK-FIXED002' }));
        const own = await api()
            .get(`/orders/${String(order._id)}/shipments`)
            .set('Authorization', customer);

        expect(json.status).toBe(200);
        expect(merge.status).toBe(200);
        expect(own.body.items[0].trackingCode).toBe('TRK-FIXED002');
    });

    it('still corrects the code once the shipment arrived, and answers 422 for an empty code', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));
        await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer);

        const late = await api()
            .patch(`/delivery/shipments/${String(shipment._id)}`)
            .set('Authorization', bearer)
            .send({ trackingCode: 'TRK-LATE0001' });
        const empty = await api()
            .patch(`/delivery/shipments/${String(shipment._id)}`)
            .set('Authorization', bearer)
            .send({ trackingCode: '' });

        expect(late.status).toBe(200);
        expect(late.body.trackingCode).toBe('TRK-LATE0001');
        expect(late.body.actions.update).toBe(true);
        expect(empty.status).toBe(422);
    });
});

describe('POST /delivery/shipments/{id}/deliver', () => {
    it('matches the contract and moves the order to delivered', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.status).toBe('delivered');
        expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
            OrderStatus.delivered
        );
    });

    it('answers 409 for a shipment that already arrived, and 404 for one that does not exist', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));
        await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer);

        const again = await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer);
        const missing = await api()
            .post(`/delivery/shipments/${MISSING_ID}/deliver`)
            .set('Authorization', bearer);

        expect(again.status).toBe(409);
        expect(again.body.errors[0].code).toBe('DELIVERY_NOT_DELIVERABLE');
        expect(missing.status).toBe(404);
    });
});

describe('POST /delivery/shipments/{id}/lost', () => {
    it('matches the contract: the shipment is lost, the order steps back, the buyer reads the message but not the note', async () => {
        const { bearer: customer, order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .post(`/delivery/shipments/${String(shipment._id)}/lost`)
            .set('Authorization', bearer)
            .send({ reason: 'lost', note: 'carrier claim 7', message: 'A new one is on its way.' });
        const own = await api()
            .get(`/orders/${String(order._id)}/shipments`)
            .set('Authorization', customer);

        expect(response.status).toBe(200);
        expect(response.body).toMatchObject({
            status: 'lost',
            lostReason: 'lost',
            lostNote: 'carrier claim 7',
            lostMessage: 'A new one is on its way.'
        });
        expect(response.body.actions).toMatchObject({ markLost: false, deliver: true });
        expect(own.body.items[0]).toMatchObject({
            status: 'lost',
            lostMessage: 'A new one is on its way.'
        });
        expect(own.body.items[0].lostNote).toBeUndefined();
        expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
            OrderStatus.processing
        );
    });

    it('answers 422 for a missing reason, an unknown one, an empty message and one past 500 characters', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));
        const url = `/delivery/shipments/${String(shipment._id)}/lost`;

        const bodies = [
            {},
            { reason: 'stolen' },
            { reason: 'lost', message: '' },
            { reason: 'lost', message: 'x'.repeat(501) }
        ];
        const statuses: number[] = [];
        for (const body of bodies) {
            const response = await api().post(url).set('Authorization', bearer).send(body);
            statuses.push(response.status);
        }

        expect(statuses).toEqual([422, 422, 422, 422]);
    });

    it('answers 409 DELIVERY_NOT_LOSABLE for a parcel already delivered or already lost, and 404 for a missing one', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));
        const url = `/delivery/shipments/${String(shipment._id)}/lost`;
        await api().post(url).set('Authorization', bearer).send({ reason: 'lost' });

        const again = await api().post(url).set('Authorization', bearer).send({ reason: 'lost' });
        const missing = await api()
            .post(`/delivery/shipments/${MISSING_ID}/lost`)
            .set('Authorization', bearer)
            .send({ reason: 'lost' });

        expect(again.status).toBe(409);
        expect(again.body.errors[0].code).toBe('DELIVERY_NOT_LOSABLE');
        expect(missing.status).toBe(404);
    });

    it('answers 409 DELIVERY_LOST_SUPERSEDED when the lost parcel arrives after its units were shipped again', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');
        const [shipment] = await shipmentsOf(String(order._id));
        await api()
            .post(`/delivery/shipments/${String(shipment._id)}/lost`)
            .set('Authorization', bearer)
            .send({ reason: 'lost' });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`)
            .set('Authorization', bearer)
            .send({});

        const arrived = await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer);

        expect(arrived.status).toBe(409);
        expect(arrived.body.errors[0].code).toBe('DELIVERY_LOST_SUPERSEDED');
    });

    it('refuses a buyer with 403 and an anonymous caller with 401', async () => {
        const { bearer: customer, order } = await authenticateWithShipment();
        const [shipment] = await shipmentsOf(String(order._id));
        const url = `/delivery/shipments/${String(shipment._id)}/lost`;

        const buyer = await api().post(url).set('Authorization', customer).send({ reason: 'lost' });
        const anonymous = await api().post(url).send({ reason: 'lost' });

        expect([buyer.status, anonymous.status]).toEqual([403, 401]);
    });
});

/**
 * `remember: 'short'` so the refresh cookie outlives the clock advance below — see
 * `account/tests/contract/api.contract.test.ts`'s own `staleButRefreshedBearer` for why an
 * unqualified login's refresh token would otherwise expire first and mask the freshness gate
 * behind a plain "token expired" 401.
 */
const loginAdminRemembered = async () => {
    const user = await createAdminUser({ verifiedAt: new Date() });
    const response = await loginCompleting(user.email, PLAIN_PASSWORD, { remember: 'short' });
    const jwtCookie = setCookie(response, '__Host-session');
    if (!jwtCookie) throw new Error('login set no jwt cookie');
    return jwtCookie;
};

/**
 * Beyond the critical window, but still holding a USABLE access token — `auth_time` is copied
 * forward on refresh, never re-stamped, so a refreshed token is exactly what a stolen-but-stale
 * session looks like.
 */
const staleButRefreshedBearer = async (jwtCookie: string): Promise<`Bearer ${string}`> => {
    advanceDate((reauthWindowSeconds('critical') + 1) * 1000);
    return bearerForCookie(jwtCookie);
};

describe('shipping and delivering never demand a step-up (SD-10)', () => {
    afterEach(() => jest.useRealTimers());

    it('never demands step-up for a ship from `paid`, even from the same stale session', async () => {
        freezeDate();
        const jwtCookie = await loginAdminRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);
        const { user } = await authenticateAs('user');
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
            status: OrderStatus.paid
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/shipments`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(201);
    });

    it('never demands step-up for a deliver from the same stale session', async () => {
        freezeDate();
        const jwtCookie = await loginAdminRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);
        const { order } = await authenticateWithShipment();
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });
});

describe('GET /delivery/fulfillment-orders — the preorder board', () => {
    const DAY = 86_400_000;

    /** An admin's own paid preorder of 2 units, promised for next month. */
    const adminWithPreorder = async () => {
        const { user, bearer } = await authenticateAs('admin');
        const placed = await paidPreorderOrder(
            [{ quantity: 2, releaseDate: new Date(Date.now() + 30 * DAY) }],
            user
        );
        await fulfillmentOrdersOf(placed.orderId);
        return { bearer, ...placed };
    };

    it('matches the contract: a row per fulfillment order, with the buyer and its state', async () => {
        const { bearer, orderId, user } = await adminWithPreorder();

        const response = await api()
            .get('/delivery/fulfillment-orders?cause=any')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toHaveLength(1);
        expect(response.body.items[0]).toMatchObject({
            orderId,
            number: 1,
            status: 'on_hold',
            state: 'waiting',
            late: false,
            delivered: false,
            slippedDays: 0,
            buyer: { email: user.email, userId: String(user._id) }
        });
        expect(response.body.meta).toMatchObject({ totalItems: 1 });
    });

    it('filters by state, product, late and dueWithin', async () => {
        const { bearer, productIds } = await adminWithPreorder();
        const ask = (query: string) =>
            api().get(`/delivery/fulfillment-orders?${query}`).set('Authorization', bearer);

        const waiting = await ask('state=waiting');
        const allocated = await ask('state=allocated');
        const byProduct = await ask(`productId=${productIds[0]}`);
        const late = await ask('late=true');
        const soon = await ask('dueWithin=7');
        const within60 = await ask('dueWithin=60');

        expect(waiting.body.items).toHaveLength(1);
        expect(allocated.body.items).toHaveLength(0);
        expect(byProduct.body.items).toHaveLength(1);
        expect(late.body.items).toHaveLength(0);
        expect(soon.body.items).toHaveLength(0);
        expect(within60.body.items).toHaveLength(1);
    });

    it('rejects a state it does not know and a dueWithin it cannot count', async () => {
        const { bearer } = await authenticateAs('admin');

        const state = await api()
            .get('/delivery/fulfillment-orders?state=nope')
            .set('Authorization', bearer);
        const due = await api()
            .get('/delivery/fulfillment-orders?dueWithin=0')
            .set('Authorization', bearer);

        expect([state.status, due.status]).toEqual([422, 422]);
    });

    it("shows a buyer only their own preorders, and an admin everyone's", async () => {
        const { bearer: adminBearer } = await authenticateAs('admin');
        const { user, bearer } = await authenticateAs('user');
        const date = new Date(Date.now() + 30 * DAY);
        const mineOrder = await paidPreorderOrder([{ quantity: 1, releaseDate: date }], user);
        const theirs = await paidPreorderOrder(
            [{ quantity: 1, releaseDate: date }],
            'someone-else@example.com'
        );
        await fulfillmentOrdersOf(mineOrder.orderId);
        await fulfillmentOrdersOf(theirs.orderId);

        const mine = await api().get('/delivery/fulfillment-orders').set('Authorization', bearer);
        const all = await api()
            .get('/delivery/fulfillment-orders')
            .set('Authorization', adminBearer);

        expect(mine.body.items).toHaveLength(1);
        expect(all.body.items).toHaveLength(2);
    });
});

describe('GET /delivery/fulfillment-orders/summary', () => {
    it('matches the contract: units per product, adding up', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const releaseDate = new Date(Date.now() + 30 * 86_400_000);
        const { orderId, productIds } = await paidPreorderOrder(
            [{ quantity: 3, releaseDate }],
            user
        );
        await fulfillmentOrdersOf(orderId);

        const response = await api()
            .get('/delivery/fulfillment-orders/summary')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.items).toEqual([
            {
                productId: productIds[0],
                title: expect.any(String),
                firstAgreedAt: releaseDate.toISOString(),
                paid: 3,
                waiting: 3,
                allocated: 0,
                shipped: 0,
                cancelled: 0,
                late: 0
            }
        ]);
    });

    it('narrows to one product', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const date = new Date(Date.now() + 30 * 86_400_000);
        const { orderId, productIds } = await paidPreorderOrder(
            [
                { quantity: 1, releaseDate: date },
                { quantity: 2, releaseDate: date }
            ],
            user
        );
        await fulfillmentOrdersOf(orderId);

        const response = await api()
            .get(`/delivery/fulfillment-orders/summary?productId=${productIds[1]}`)
            .set('Authorization', bearer);

        expect(response.body.items).toMatchObject([{ productId: productIds[1], paid: 2 }]);
    });
});

describe('GET /delivery/fulfillment-orders/release-date-impact', () => {
    const DAY = 86_400_000;
    const url = '/delivery/fulfillment-orders/release-date-impact';

    /** An admin who is logged in, with one paid preorder promised 30 days out. */
    const adminWithPreorder = async () => {
        const { user, bearer } = await authenticateAs('admin');
        const { orderId, productIds } = await paidPreorderOrder(
            [{ quantity: 1, releaseDate: new Date(Date.now() + 30 * DAY) }],
            user
        );
        await fulfillmentOrdersOf(orderId);
        return { bearer, productId: productIds[0] };
    };

    it('matches the contract: one order told a long slip is one order to email', async () => {
        const { bearer, productId } = await adminWithPreorder();

        const response = await api()
            .get(url)
            .query({ productId, releaseDate: new Date(Date.now() + 75 * DAY).toISOString() })
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ notify: 1 });
    });

    it('matches the contract: an earlier date emails nobody', async () => {
        const { bearer, productId } = await adminWithPreorder();

        const response = await api()
            .get(url)
            .query({ productId, releaseDate: new Date(Date.now() + 10 * DAY).toISOString() })
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ notify: 0 });
    });

    it.each([
        ['absent', {}],
        ['blank', { releaseDate: '' }]
    ])(
        'reads a %s releaseDate as a cleared date, which tells every waiting buyer',
        async (_name, extra) => {
            const { bearer, productId } = await adminWithPreorder();

            const response = await api()
                .get(url)
                .query({ productId, ...extra })
                .set('Authorization', bearer);

            expect(response.status).toBe(200);
            expect(response.body).toEqual({ notify: 1 });
        }
    );

    it('refuses a date more than a year ahead, as the save does', async () => {
        const { bearer, productId } = await adminWithPreorder();

        const response = await api()
            .get(url)
            .query({ productId, releaseDate: new Date(Date.now() + 400 * DAY).toISOString() })
            .set('Authorization', bearer);

        expect(response.status).toBe(422);
    });

    it('answers 404 for a product that does not exist', async () => {
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .get(url)
            .query({ productId: MISSING_ID })
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });

    it('is refused to an editor, who may move a date but not read orders', async () => {
        const { productId } = await adminWithPreorder();
        const { bearer } = await authenticateAsRole('editor');

        const response = await api().get(url).query({ productId }).set('Authorization', bearer);

        expect(response.status).toBe(403);
    });
});

describe('GET /delivery/fulfillment-orders/restock-date-impact', () => {
    const DAY = 86_400_000;
    const url = '/delivery/fulfillment-orders/restock-date-impact';

    it('matches the contract: one backordered buyer whose date is cleared is one buyer to email', async () => {
        const { bearer } = await authenticateAs('admin');
        const { orderId, productId } = await paidBackorderOrder({
            quantity: 1,
            shelf: 0,
            restockDate: new Date(Date.now() + 20 * DAY)
        });

        await fulfillmentOrdersOf(orderId);

        const response = await api().get(url).query({ productId }).set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body).toEqual({ notify: 1 });
    });
});
