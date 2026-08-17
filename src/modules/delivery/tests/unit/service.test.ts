/**
 * Delivery — the rates rules, the shipment lifecycle, and the fake courier.
 *
 * What is worth pinning: the free-above rule prices against the items total and nothing else;
 * an order reaching `shipped` gets exactly one parcel and exactly one email however many times
 * the status wobbles; the courier tick moves the ORDER first (conditionally) and only then the
 * parcel, so the two can lag but never contradict.
 *
 * Real Mongo (`setupTestDb`); the shipped email is asserted through the mocked queue, the same
 * seam the cart's confirmation-email tests use.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factory';
import { createProduct } from '@modules/products/tests/factory';
import { createOrder, toOrderItem } from '@modules/orders/tests/factory';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { orderService, orderRepository } from '@modules/orders';
import { findShippingMethod, priceShipping, SHIPPING_METHODS } from '@modules/delivery/domain';
import { shipOrder, runCourierAdvance, getForOrder } from '@modules/delivery/service';
import { shipmentRepository } from '@modules/delivery/repository';
import deliveryModule from '@modules/delivery/module';
import inventoryModule from '@modules/inventory/module';
import ordersModule from '@modules/orders/module';
import productsModule from '@modules/products/module';
import usersModule from '@modules/users/module';
import type { ResponseReject } from '@infrastructure/http/response';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

const asReject = (result: unknown) => result as ResponseReject;

const shippedOrderFor = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 10 });
    const order = await createOrder(user, [toOrderItem(product, 1)]);
    await orderRepository.updateStatusIfIn(String(order._id), ['pending'], 'shipped');
    return { user, order };
};

describe('rates', () => {
    it('prices the flat rate below the threshold and zero at it', () => {
        const standard = findShippingMethod('standard')!;

        expect(priceShipping(standard, 99.99)).toBe(standard.price);
        expect(priceShipping(standard, 100)).toBe(0);
    });

    it('a method with no threshold never becomes free', () => {
        const express = findShippingMethod('express')!;

        expect(priceShipping(express, 1_000_000)).toBe(express.price);
    });

    it('pickup is free and still a method — "cheapest" and "none" stay distinguishable', () => {
        const pickup = findShippingMethod('pickup')!;

        expect(priceShipping(pickup, 1)).toBe(0);
        expect(SHIPPING_METHODS.some(({ id }) => id === 'pickup')).toBe(true);
    });

    it('an unknown id is undefined — the caller decides what absence answers', () => {
        expect(findShippingMethod('teleport')).toBeUndefined();
    });
});

describe('shipOrder', () => {
    it('creates the parcel and sends the tracking email once', async () => {
        mockEnqueueEmail.mockClear();
        const { order } = await shippedOrderFor();

        await shipOrder(String(order._id));

        const shipment = await shipmentRepository.findByOrderId(String(order._id));
        expect(shipment!.status).toBe('shipped');
        expect(shipment!.trackingCode).toBe(`TRK-${String(order._id).slice(-8).toUpperCase()}`);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(order.email);
        expect(template).toBe('delivery.shipment-shipped.ejs');
        expect(String(data?.tracking)).toContain(shipment!.trackingCode);
    });

    it('is idempotent — a wobbling status neither re-mints the code nor re-sends the email', async () => {
        mockEnqueueEmail.mockClear();
        const { order } = await shippedOrderFor();

        await shipOrder(String(order._id));
        await shipOrder(String(order._id));

        await expect(shipmentRepository.count({})).resolves.toBe(1);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
    });
});

describe('runCourierAdvance', () => {
    it('delivers every parcel on a truck, order first', async () => {
        const { order } = await shippedOrderFor();
        await shipOrder(String(order._id));

        const advanced = await runCourierAdvance();

        expect(advanced).toBe(1);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe('delivered');
        const shipment = await shipmentRepository.findByOrderId(String(order._id));
        expect(shipment!.status).toBe('delivered');
        expect(shipment!.deliveredAt).toBeInstanceOf(Date);
    });

    it('a second tick finds an empty truck', async () => {
        const { order } = await shippedOrderFor();
        await shipOrder(String(order._id));
        await runCourierAdvance();

        await expect(runCourierAdvance()).resolves.toBe(0);
    });
});

describe('getForOrder', () => {
    it('answers the owner, refuses a stranger as absence, and distinguishes "not shipped yet"', async () => {
        const { user, order } = await shippedOrderFor();
        await shipOrder(String(order._id));
        const stranger = await createUser({ email: 'stranger@example.com' });

        const own = await getForOrder(String(order._id), { id: user.id, admin: false });
        const other = await getForOrder(String(order._id), { id: stranger.id, admin: false });

        expect(own.success).toBe(true);
        expect(asReject(other).status).toBe(404);

        // An order of the caller's that simply has not shipped is also absence — of the parcel.
        const product = await createProduct();
        const unshipped = await createOrder(user, [toOrderItem(product, 1)]);
        const early = await getForOrder(String(unshipped._id), { id: user.id, admin: false });
        expect(asReject(early).status).toBe(404);
    });
});

/*
 * The subscription: an admin write moving an order to `shipped` must be enough — no controller
 * may need to remember to call delivery. Registry required, same shape as every event suite.
 */
describe('shipment rides the status change', () => {
    beforeEach(() => {
        registerModules([
            productsModule,
            usersModule,
            inventoryModule,
            ordersModule,
            deliveryModule
        ]);
    });

    afterEach(() => {
        resetDomainEvents();
    });

    it('the admin status write alone produces the parcel', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)]);

        const result = await orderService.update(order, { status: 'shipped' });

        expect(result.success).toBe(true);
        const shipment = await shipmentRepository.findByOrderId(String(order._id));
        expect(shipment).not.toBeNull();
    });
});
