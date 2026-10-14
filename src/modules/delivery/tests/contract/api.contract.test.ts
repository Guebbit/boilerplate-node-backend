/**
 * @module
 * Contract tests for /delivery over real HTTP — every response is judged against the spec
 * automatically (`@tests/contract`). Nine routes, three audiences: the methods list is public, the
 * fulfilment read is the owner's, the write doors are staff's. These pin that each contract
 * branch is reached over HTTP; the acts' own rules live in the unit and integration suites.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, authenticateAsRole, bearerForCookie } from '@tests/http';
import { MISSING_ID } from '@tests/ids';
import { setCookie } from '@tests/cookies';
import { freezeDate, advanceDate } from '@tests/clock';
import { createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import {
    fulfillmentOrdersOf,
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
        expect(response.body.data.methods.length).toBeGreaterThan(0);
    });

    it('lists every method regardless of a query string trying to filter it', async () => {
        // `?weight=` was dropped: the list is a catalogue now, unfiltered. A query param a
        // caller still sends must not silently change the response shape.
        const response = await api().get('/delivery/methods').query({ weight: 10_000 });

        expect(response.status).toBe(200);
        const ids = (response.body.data.methods as { id: string }[]).map(({ id }) => id);
        expect(ids).toContain('standard');
        expect(ids).toContain('express');
    });

    // The answer names which countries this deployment ships to — the frontend reads it here
    // rather than guessing.
    it('lists the configured ship-to countries', async () => {
        const response = await api().get('/delivery/methods');

        // `tests/support/setup-environment.ts` sets `NODE_SHOP_COUNTRY=IT`; `NODE_SHIP_TO_COUNTRIES` is unset.
        expect(response.body.data.shipToCountries).toEqual(['IT']);
    });

    // Every method carries the shop's own currency — the frontend reads it here rather
    // than guessing a fixed default.
    it('stamps every method with the shop currency', async () => {
        const response = await api().get('/delivery/methods');

        const currencies = (response.body.data.methods as { currency: string }[]).map(
            ({ currency }) => currency
        );
        expect(currencies.every((currency) => currency === 'EUR')).toBe(true);
    });
});

describe('GET /delivery/order/{orderId}', () => {
    it('matches the contract for the caller’s own fulfilment: both lists, each with its actions', async () => {
        const { bearer, order } = await authenticateWithShipment();

        const response = await api()
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.fulfillmentOrders).toHaveLength(1);
        expect(response.body.data.fulfillmentOrders[0]).toMatchObject({
            number: 1,
            kind: 'physical',
            status: 'closed'
        });
        expect(response.body.data.shipments).toHaveLength(1);
        expect(response.body.data.shipments[0]).toMatchObject({
            number: 1,
            status: 'shipped',
            trackingCode: 'TRK-CONTRACT1'
        });
        // The buyer sees their goods, and nothing they could act on as staff.
        expect(response.body.data.shipments[0].actions).toEqual({
            deliver: false,
            editTracking: false
        });
    });

    it('answers both lists empty for an order that is not paid yet — absence is the answer', async () => {
        const { user, bearer } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data).toEqual({ fulfillmentOrders: [], shipments: [] });
    });

    it('serves staff the actions they may take, and the hold note only to them', async () => {
        const { bearer, orderId, fulfillmentOrderId } = await adminWithOrder();
        await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/hold`)
            .set('Authorization', bearer)
            .send({ reason: 'high_risk', note: 'call first' });

        const response = await api().get(`/delivery/order/${orderId}`).set('Authorization', bearer);

        expect(response.body.data.fulfillmentOrders[0]).toMatchObject({
            status: 'on_hold',
            holdReason: 'high_risk',
            holdNote: 'call first',
            actions: { ship: false, fulfill: false, hold: false, release: true }
        });
    });

    it('answers 404 for another customer’s order', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAsRole('customer');

        const response = await api()
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(404);
    });
});

describe('POST /delivery/order/{orderId}/start', () => {
    it('matches the contract and moves a paid order to processing', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/start`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('processing');
        // Starting made the fulfillment orders too: the warehouse can ship straight away.
        expect(await fulfillmentOrdersOf(String(order._id))).toHaveLength(1);
    });

    it('matches the error contract for an order that is not paid', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/start`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
    });

    it('matches the error contract for a customer, who holds no delivery.any.start', async () => {
        const { bearer, user } = await authenticateAs('user');
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
            status: OrderStatus.paid
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/start`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
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
        expect(response.headers.location).toBe(`/delivery/order/${orderId}`);
        expect(response.body.data).toMatchObject({
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
        expect(response.body.data.lines).toEqual([
            expect.objectContaining({ productId, quantity: 1 })
        ]);
        expect(await readOrder(orderId).then((one) => one?.status)).toBe(OrderStatus.processing);
        const read = await api().get(`/orders/${orderId}`).set('Authorization', bearer);
        expect(read.body.data.fulfillmentStatus).toBe('partially_fulfilled');
    });

    it('matches the error contract when a tracked method has no code', async () => {
        const { bearer, fulfillmentOrderId } = await adminWithOrder(1, {
            shippingMethod: 'express'
        });

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/shipments`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(422);
        expect(response.body.errors[0]).toMatchObject({
            code: 'DELIVERY_TRACKING_CODE_REQUIRED',
            details: { field: 'trackingCode' }
        });
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

    it('refuses a forced ship of a pending order, which has no fulfillment order to ship from', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.pending
        });

        const response = await api()
            .post(`/delivery/fulfillment-orders/${MISSING_ID}/shipments`)
            .set('Authorization', bearer)
            .send({ forced: true, reason: 'skipping the payment' });

        expect(response.status).toBe(404);
        expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
            OrderStatus.pending
        );
    });

    it('answers 403 to a customer, and 404 to an id that is not a fulfillment order', async () => {
        const { bearer: customer } = await authenticateAs('user');
        const { bearer: admin } = await authenticateAs('admin');

        const forbidden = await api()
            .post(`/delivery/fulfillment-orders/${MISSING_ID}/shipments`)
            .set('Authorization', customer)
            .send({});
        const missing = await api()
            .post(`/delivery/fulfillment-orders/${MISSING_ID}/shipments`)
            .set('Authorization', admin)
            .send({});

        expect(forbidden.status).toBe(403);
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

        expect(response.status).toBe(200);
        expect(response.body.data).toMatchObject({ status: 'delivered', number: 1 });
        expect(await readOrder(String(order._id)).then((one) => one?.status)).toBe(
            OrderStatus.delivered
        );
        // The shipment is born delivered and never carried a tracking code.
        expect(
            await shipmentsOf(String(order._id)).then(([first]) => first.trackingCode)
        ).toBeUndefined();
    });

    it('matches the error contract for a fulfillment order that still has a physical line', async () => {
        const { bearer, fulfillmentOrderId } = await adminWithOrder();

        const response = await api()
            .post(`/delivery/fulfillment-orders/${fulfillmentOrderId}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('DELIVERY_NOT_DIGITAL');
    });

    it('matches the error contract for a digital-only order that is not processing yet', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.paid
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('ORDER_NOT_PROCESSING');
    });

    it('matches the error contract for a customer, who holds no delivery.any.update', async () => {
        const { bearer, user } = await authenticateAs('user');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        const response = await api()
            .post(`/delivery/fulfillment-orders/${String(fulfillmentOrder._id)}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
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
        expect(held.body.data).toMatchObject({
            status: 'on_hold',
            holdReason: 'incorrect_address'
        });
        expect(heldAgain.status).toBe(409);
        expect(heldAgain.body.errors[0].code).toBe('DELIVERY_NOT_HOLDABLE');
        expect(released.status).toBe(200);
        expect(released.body.data.status).toBe('open');
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
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', customer);

        expect(json.status).toBe(200);
        expect(merge.status).toBe(200);
        expect(own.body.data.shipments[0].trackingCode).toBe('TRK-FIXED002');
    });

    it('answers 409 once the shipment arrived, and 422 for an empty code', async () => {
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

        expect(late.status).toBe(409);
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
        expect(response.body.data.status).toBe('delivered');
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

    it('answers 403 to a customer', async () => {
        const { order, bearer } = await authenticateWithShipment();
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
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
    const response = await api()
        .post('/account/login')
        .send({ email: user.email, password: PLAIN_PASSWORD, remember: 'short' });
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

describe('forced ship/deliver demands the same step-up POST /orders/{id}/status-override does (SD-10)', () => {
    afterEach(() => jest.useRealTimers());

    it('answers 401 for a forced deliver from a stale-but-refreshed session', async () => {
        freezeDate();
        const jwtCookie = await loginAdminRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);
        const { order } = await authenticateWithShipment();
        const [shipment] = await shipmentsOf(String(order._id));

        const response = await api()
            .post(`/delivery/shipments/${String(shipment._id)}/deliver`)
            .set('Authorization', bearer)
            .send({ forced: true, reason: 'testing the step-up gate' });

        expect(response.status).toBe(401);
    });

    it('answers 401 for a forced ship from a stale-but-refreshed session', async () => {
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
            .send({ forced: true, reason: 'testing the step-up gate' });

        expect(response.status).toBe(401);
    });

    it('never demands step-up for a plain, unforced deliver from the same stale session', async () => {
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
            .get('/delivery/fulfillment-orders?preorder=true')
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.items).toHaveLength(1);
        expect(response.body.data.items[0]).toMatchObject({
            orderId,
            number: 1,
            status: 'on_hold',
            state: 'waiting',
            late: false,
            delivered: false,
            slippedDays: 0,
            buyer: { email: user.email, userId: String(user._id) }
        });
        expect(response.body.data.meta).toMatchObject({ totalItems: 1 });
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

        expect(waiting.body.data.items).toHaveLength(1);
        expect(allocated.body.data.items).toHaveLength(0);
        expect(byProduct.body.data.items).toHaveLength(1);
        expect(late.body.data.items).toHaveLength(0);
        expect(soon.body.data.items).toHaveLength(0);
        expect(within60.body.data.items).toHaveLength(1);
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

        expect(mine.body.data.items).toHaveLength(1);
        expect(all.body.data.items).toHaveLength(2);
    });

    it('requires a session', async () => {
        const response = await api().get('/delivery/fulfillment-orders');

        expect(response.status).toBe(401);
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
        expect(response.body.data.items).toEqual([
            {
                productId: productIds[0],
                title: expect.any(String),
                firstAgreedAt: releaseDate.toISOString(),
                paid: 3,
                waiting: 3,
                awaitingYes: 0,
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

        expect(response.body.data.items).toMatchObject([{ productId: productIds[1], paid: 2 }]);
    });
});
