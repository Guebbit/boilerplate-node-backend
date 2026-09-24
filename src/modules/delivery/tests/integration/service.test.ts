/**
 * @module
 * Delivery — the rates rules and the shipment lifecycle. What is worth pinning: the free-above
 * rule prices against the items total alone; `ship` writes the parcel and moves the order
 * together, and refuses an order that is not `processing`; `deliver` does the same for
 * `shipped → delivered`. Real Mongo (`setupTestDb`); the shipped email is asserted through the
 * mocked queue, the cart's confirmation-email seam.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { OrderStatus } from '@types';
import { findShippingMethod, priceShipping, SHIPPING_METHODS } from '@modules/delivery/domain';
import { recordShipment, recordDelivery, getForOrder } from '@modules/delivery/service';
import { shipmentRepository } from '@modules/delivery/repository';
import { asReject } from '@tests/response';
import { asCustomer, testCallerContext } from '@tests/callers';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => jest.restoreAllMocks());

/** An order ready to ship — `processing`, no shipping method frozen (so `tracked` is `false`). */
const processingOrderFor = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 10 });
    const order = await createOrder(user, [toOrderItem(product, 1)], {
        status: OrderStatus.processing
    });
    return { user, order };
};

const shippedOrderFor = async () => {
    const { user, order } = await processingOrderFor();
    await recordShipment(String(order._id), 'TRK-TESTFIXTURE', testCallerContext);
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

    it('express is the one method that requires a tracking code', () => {
        expect(SHIPPING_METHODS.filter((method) => method.tracked).map(({ id }) => id)).toEqual([
            'express'
        ]);
    });
});

describe('recordShipment', () => {
    it('writes the parcel, moves the order, and sends the tracking email once', async () => {
        mockEnqueueEmail.mockClear();
        const { order } = await processingOrderFor();

        const result = await recordShipment(String(order._id), 'TRK-ABCDEF12', testCallerContext);

        expect(result.success).toBe(true);
        const shipment = await shipmentRepository.findByOrderId(String(order._id));
        expect(shipment!.status).toBe('shipped');
        expect(shipment!.trackingCode).toBe('TRK-ABCDEF12');
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.shipped);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(order.email);
        expect(template).toBe('delivery.shipment-shipped');
        expect(String(data?.tracking)).toContain('TRK-ABCDEF12');
    });

    it('still ships and mails the fallback name when the buyer lookup fails, and logs it', async () => {
        mockEnqueueEmail.mockClear();
        const loggedError = jest.spyOn(logger, 'error').mockImplementation(() => logger);
        const { order } = await processingOrderFor();
        jest.spyOn(userService, 'getById').mockRejectedValueOnce(new Error('lookup unavailable'));

        const result = await recordShipment(String(order._id), 'TRK-FALLBACK1', testCallerContext);

        expect(result.success).toBe(true);
        const shipment = await shipmentRepository.findByOrderId(String(order._id));
        expect(shipment!.status).toBe('shipped');
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(order.email);
        expect(template).toBe('delivery.shipment-shipped');
        // Fallback name policy: `username ?? email`, and no username was ever resolved.
        expect(data?.greeting).toContain(order.email);
        expect(loggedError).toHaveBeenCalled();
    });

    it('refuses an order that is not processing', async () => {
        const { order } = await processingOrderFor();
        await recordShipment(String(order._id), 'TRK-FIRST0001', testCallerContext);

        const result = await recordShipment(String(order._id), 'TRK-SECOND002', testCallerContext);

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('ORDER_NOT_PROCESSING');
    });

    it('refuses a missing tracking code for a tracked method, and never writes the parcel', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing,
            shippingMethod: 'express'
        });

        const result = await recordShipment(String(order._id), undefined, testCallerContext);

        expect(asReject(result).status).toBe(422);
        expect(asReject(result).errors[0].code).toBe('DELIVERY_TRACKING_CODE_REQUIRED');
        await expect(shipmentRepository.findByOrderId(String(order._id))).resolves.toBeNull();
    });

    it('allows an untracked method to ship with no code at all', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing,
            shippingMethod: 'standard'
        });

        const result = await recordShipment(String(order._id), undefined, testCallerContext);

        expect(result.success).toBe(true);
        const shipment = await shipmentRepository.findByOrderId(String(order._id));
        expect(shipment!.trackingCode).toBeUndefined();
    });
});

describe('recordDelivery', () => {
    it('stamps the parcel and moves the order', async () => {
        const { order } = await shippedOrderFor();

        const result = await recordDelivery(String(order._id), testCallerContext);

        expect(result.success).toBe(true);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.delivered);
        const shipment = await shipmentRepository.findByOrderId(String(order._id));
        expect(shipment!.status).toBe('delivered');
        expect(shipment!.deliveredAt).toBeInstanceOf(Date);
    });

    it('refuses an order that has not shipped', async () => {
        const { order } = await processingOrderFor();

        const result = await recordDelivery(String(order._id), testCallerContext);

        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('ORDER_NOT_SHIPPED');
    });

    it('refuses a second delivery of the same parcel', async () => {
        const { order } = await shippedOrderFor();
        await recordDelivery(String(order._id), testCallerContext);

        const result = await recordDelivery(String(order._id), testCallerContext);

        expect(asReject(result).status).toBe(409);
    });
});

describe('getForOrder', () => {
    it('answers the owner, refuses a stranger as absence, and distinguishes "not shipped yet"', async () => {
        const { user, order } = await shippedOrderFor();
        const stranger = await createUser({ email: 'stranger@example.com' });

        const own = await getForOrder(String(order._id), asCustomer(user.id));
        const other = await getForOrder(String(order._id), asCustomer(stranger.id));

        expect(own.success).toBe(true);
        expect(asReject(other).status).toBe(404);

        // An order of the caller's that simply has not shipped is also absence — of the parcel.
        const product = await createProduct();
        const unshipped = await createOrder(user, [toOrderItem(product, 1)]);
        const early = await getForOrder(String(unshipped._id), asCustomer(user.id));
        expect(asReject(early).status).toBe(404);
    });
});
