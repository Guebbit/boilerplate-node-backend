/**
 * @module
 * Contract tests for /delivery. Four routes, three audiences: the methods list is public, the
 * shipment read is the owner's, the two write doors are staff's. These pin that each contract
 * branch is reached over HTTP; the moves' own rules live in the unit and integration suites.
 */

import '@tests/contract';
import { setupTestDb } from '@tests/setup-test-db';
import { testCallerContext } from '@tests/caller-context';
import { api, authenticateAs } from '@tests/http';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { deliveryService } from '@modules/delivery/service';
import { OrderStatus } from '@types';

setupTestDb();

/** A customer logged in with one order already shipped and its parcel created. */
const authenticateWithShipment = async () => {
    const { user, bearer } = await authenticateAs('user');
    const product = await createProduct();
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.processing
    });
    await deliveryService.recordShipment(String(order._id), 'TRK-CONTRACT1', testCallerContext);
    return { bearer, order };
};

describe('GET /delivery/methods', () => {
    it('matches the contract, unauthenticated included — rates are pre-purchase information', async () => {
        const response = await api().get('/delivery/methods');

        expect(response.status).toBe(200);
        expect(response.body.data.methods.length).toBeGreaterThan(0);
        expect(response).toSatisfyApiSpec();
    });

    it('filters out a method the given weight does not fit', async () => {
        // Over express's 5000g ceiling, under standard's 30000g one.
        const response = await api().get('/delivery/methods').query({ weight: 10_000 });

        expect(response.status).toBe(200);
        const ids = (response.body.data.methods as { id: string }[]).map(({ id }) => id);
        expect(ids).toContain('standard');
        expect(ids).not.toContain('express');
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
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
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
        expect(response).toSatisfyApiSpec();
    });
});
