/**
 * @module
 * Contract tests for /delivery. Five routes, three audiences: the methods list is public, the
 * shipment read is the owner's, the three write doors are staff's. These pin that each contract
 * branch is reached over HTTP; the moves' own rules live in the unit and integration suites.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { callerContextAs } from '@tests/callers';
import { api, authenticateAs } from '@tests/http';
import { setCookie } from '@tests/cookies';
import { freezeDate, advanceDate } from '@tests/clock';
import { createAdminUser, PLAIN_PASSWORD } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, readOrder, toOrderItem } from '@modules/orders/tests/factories';
import { deliveryService } from '@modules/delivery/service';
import { REAUTH_TIME_CRITICAL } from '@kernel/middlewares/authorizations';
import { OrderStatus } from '@types';

setupTestDb();

/** A customer logged in with one order already shipped and its parcel created. */
const authenticateWithShipment = async () => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.processing
    });
    await deliveryService.recordShipment(
        String(order._id),
        'TRK-CONTRACT1',
        callerContextAs('admin')
    );
    return { bearer, order };
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
    it('matches the contract for the caller`s own shipment', async () => {
        const { bearer, order } = await authenticateWithShipment();

        const response = await api()
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.trackingCode).toContain('TRK-');
    });

    it('matches the error contract when the order has not shipped', async () => {
        const { user, bearer } = await authenticateAs('user');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

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

describe('POST /delivery/order/{orderId}/ship', () => {
    it('matches the contract and moves the order to shipped', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/ship`)
            .set('Authorization', bearer)
            .send({ trackingCode: 'TRK-SHIPDOOR1' });

        expect(response.status).toBe(200);
        expect(response.body.data.trackingCode).toBe('TRK-SHIPDOOR1');
    });

    it('matches the error contract when a tracked method has no code', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing,
            shippingMethod: 'express'
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/ship`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(422);
    });

    it('matches the error contract for a digital-only order — nothing here would ever ride in a parcel', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/ship`)
            .set('Authorization', bearer)
            .send({});

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('ORDER_NOTHING_TO_SHIP');
    });
});

describe('POST /delivery/order/{orderId}/fulfill', () => {
    it('matches the contract and moves a digital-only order straight to delivered', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('delivered');
        // No parcel is created by this door — `GET /delivery/order/{orderId}` still answers 404.
        const shipment = await api()
            .get(`/delivery/order/${String(order._id)}`)
            .set('Authorization', bearer);
        expect(shipment.status).toBe(404);
    });

    it('matches the error contract for an order that still has a physical line', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const physical = await createProduct();
        const order = await createOrder(user, [toOrderItem(physical, 1)], {
            status: OrderStatus.processing
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(409);
        expect(response.body.errors[0].code).toBe('ORDER_NOT_DIGITAL_ONLY');
    });

    it('matches the error contract for a digital-only order that is not processing yet', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.paid
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/fulfill`)
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

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/fulfill`)
            .set('Authorization', bearer);

        expect(response.status).toBe(403);
    });

    /*
     * The digital-only alternative and the ordinary ship door are mutually exclusive on
     * the wire, not just enforced server-side — a client renders exactly one of the two controls.
     */
    it('offers fulfill instead of ship for a digital-only order, and the reverse for a physical one', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const physical = await createProduct();
        const digitalOrder = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });
        const physicalOrder = await createOrder(user, [toOrderItem(physical, 1)], {
            status: OrderStatus.processing
        });

        const digitalRead = await api()
            .get(`/orders/${String(digitalOrder._id)}`)
            .set('Authorization', bearer);
        const physicalRead = await api()
            .get(`/orders/${String(physicalOrder._id)}`)
            .set('Authorization', bearer);

        expect(digitalRead.body.data.actions).toMatchObject({ fulfill: true, ship: false });
        expect(physicalRead.body.data.actions).toMatchObject({ fulfill: false, ship: true });
    });

    it('offers neither fulfill nor ship for a digital-only order still awaiting `start`', async () => {
        const { user, bearer } = await authenticateAs('admin');
        const digital = await createProduct({ requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(digital, 1)], {
            status: OrderStatus.paid
        });

        const response = await api()
            .get(`/orders/${String(order._id)}`)
            .set('Authorization', bearer);

        expect(response.body.data.actions).toMatchObject({ fulfill: false, ship: false });
    });
});

describe('POST /delivery/order/{orderId}/deliver', () => {
    it('matches the contract and moves the order to delivered', async () => {
        const { order } = await authenticateWithShipment();
        const { bearer } = await authenticateAs('admin');

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/deliver`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
        expect(response.body.data.status).toBe('delivered');
    });

    /*
     * `recordDelivery` must check a shipment exists to stamp BEFORE moving the order to
     * `delivered` — otherwise a forced deliver on an order with no parcel on file would move the
     * order and only then answer 409, a refusal that lies about what already happened. `forced` widens which ORDER statuses are eligible; it never means the shipment
     * doesn't have to exist.
     */
    it('answers 409 and leaves the order untouched when forced-delivering one with no shipment', async () => {
        const { user, bearer: adminBearer } = await authenticateAs('admin');
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/deliver`)
            .set('Authorization', adminBearer)
            .send({ forced: true, reason: 'testing the override path' });

        expect(response.status).toBe(409);
        const stored = await readOrder(String(order._id));
        expect(stored?.status).toBe(OrderStatus.processing);
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
    const jwtCookie = setCookie(response, 'jwt');
    if (!jwtCookie) throw new Error('login set no jwt cookie');
    return jwtCookie;
};

/**
 * Beyond `REAUTH_TIME_CRITICAL`, but still holding a USABLE access token — `auth_time` is copied
 * forward on refresh, never re-stamped, so a refreshed token is exactly what a stolen-but-stale
 * session looks like.
 */
const staleButRefreshedBearer = async (jwtCookie: string): Promise<`Bearer ${string}`> => {
    advanceDate((REAUTH_TIME_CRITICAL + 1) * 1000);
    const refreshed = await api().get('/account/refresh').set('Cookie', jwtCookie);
    return `Bearer ${refreshed.body.data.token as string}`;
};

describe('forced ship/deliver demands the same step-up POST /orders/{id}/status-override does (SD-10)', () => {
    afterEach(() => jest.useRealTimers());

    it('answers 401 for a forced deliver from a stale-but-refreshed session', async () => {
        freezeDate();
        const jwtCookie = await loginAdminRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);
        const product = await createProduct();
        const owner = await createAdminUser({
            email: 'stepup-owner@example.com',
            username: 'stepupowner'
        });
        const order = await createOrder(owner, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        await deliveryService.recordShipment(
            String(order._id),
            'TRK-STEPUP',
            callerContextAs('admin')
        );

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/deliver`)
            .set('Authorization', bearer)
            .send({ forced: true, reason: 'testing the step-up gate' });

        expect(response.status).toBe(401);
    });

    it('never demands step-up for a plain, unforced deliver from the same stale session', async () => {
        freezeDate();
        const jwtCookie = await loginAdminRemembered();
        const bearer = await staleButRefreshedBearer(jwtCookie);
        const { order } = await authenticateWithShipment();

        const response = await api()
            .post(`/delivery/order/${String(order._id)}/deliver`)
            .set('Authorization', bearer);

        expect(response.status).toBe(200);
    });
});
