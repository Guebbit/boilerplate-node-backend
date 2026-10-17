/**
 * @module
 * Delivery — the rates rules and the fulfilment acts. What is worth pinning: the free-above rule
 * prices against the items total alone; an order that is paid gets one fulfillment order, and
 * shipping it writes the shipment and moves the order together; shipping in parts keeps the order
 * `processing` until nothing remains, and the withdrawal clock starts from the LAST arrival; holds,
 * digital fulfilment, forced shipments and an order cancel all leave the records and the order in
 * step. Real Mongo (`setupTestDb`); the shipped email is asserted through the mocked queue, the
 * cart's confirmation-email seam.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { logger } from '@infrastructure/adapters/logger';
import { createUser } from '@modules/users/tests/factories';
import { userService } from '@modules/users';
import { countersOf, createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    seedDigitalOrder,
    toOrderItem,
    lastOverrideOf
} from '@modules/orders/tests/factories';
import { orderService, withdrawUntilFrom } from '@modules/orders';
import { OrderStatus } from '@types';
import { findShippingMethod, priceShipping, SHIPPING_METHODS } from '@modules/delivery/domain';
import { deliveryService } from '@modules/delivery/services';
import { fulfillmentOrderRepository } from '@modules/delivery/repository';
import { fulfillmentOrderModel } from '@modules/delivery/model';
import { fulfillmentOrdersOf, shipmentsOf } from '@modules/delivery/tests/factories';
import { asReject } from '@tests/response';
import { asAdmin, asCustomer, asRole, callerContextAs } from '@tests/callers';
import { inventoryService } from '@modules/inventory';
import { settleOutboxNudges } from '@kernel/outbox';
import { markDomainEventsWired, resetDomainEvents } from '@kernel/events';
import deliveryModule from '@modules/delivery/module';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
    resetDomainEvents();
});

/** Subscribe the module's own listeners, as the app's boot does, so the outbox delivers to them. */
const wireDelivery = (): void => {
    resetDomainEvents();
    deliveryModule.subscribe();
    markDomainEventsWired();
};

/** The admin, as the caller of every act below. */
const admin = callerContextAs('admin');

/** An order ready to ship — `processing`, with `lines` product lines of the given quantities. */
const processingOrderOf = async (
    quantities: number[] = [1],
    extras = {},
    email = 'user@example.com'
) => {
    const user = await createUser({ email });
    const products = await Promise.all(quantities.map(() => createProduct({ price: 10 })));
    const order = await createOrder(
        user,
        products.map((product, index) => toOrderItem(product, quantities[index])),
        { status: OrderStatus.processing, ...extras }
    );
    return { user, order, products };
};

/** Ship `lines` (or everything, when omitted) from the order's one physical fulfillment order. */
const shipFrom = async (
    orderId: string,
    input: Parameters<typeof deliveryService.shipFulfillmentOrder>[1] = {},
    number = 1
) => {
    const all = await fulfillmentOrdersOf(orderId);
    const fulfillmentOrder = all.find((one) => one.number === number)!;
    return deliveryService.shipFulfillmentOrder(
        String(fulfillmentOrder._id),
        input,
        asAdmin(),
        admin
    );
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

describe('the fulfillment orders of a paid order', () => {
    it('are made once, whoever asks and however often', async () => {
        const { order } = await processingOrderOf([2, 1]);

        const [first] = await Promise.all([
            fulfillmentOrdersOf(String(order._id)),
            fulfillmentOrdersOf(String(order._id))
        ]);
        const again = await fulfillmentOrdersOf(String(order._id));

        expect(first).toHaveLength(1);
        expect(again).toHaveLength(1);
        expect(again[0].kind).toBe('physical');
        expect(again[0].status).toBe('open');
        expect(again[0].lines.map(({ quantity }) => quantity)).toEqual([2, 1]);
    });

    // The `paid` listener can read an order paid and then lose it to a cancel before it writes. A
    // throw there would hold up every later event of the order, the cancel's refund among them.
    it('are not made, and nothing fails, when the order is cancelled between the read and the write', async () => {
        const user = await createUser();
        const order = await createOrder(user, [toOrderItem(await createProduct(), 1)], {
            status: OrderStatus.paid
        });
        jest.spyOn(orderService, 'recordFulfillmentProgress').mockResolvedValueOnce(null);

        await expect(
            deliveryService.ensureFulfillmentOrders(String(order._id))
        ).resolves.toBeUndefined();

        expect(await fulfillmentOrderRepository.findByOrderId(String(order._id))).toEqual([]);
    });

    it('are not made for an order that has not been paid, nor for one already past dispatch', async () => {
        const user = await createUser();
        const product = await createProduct();
        const pending = await createOrder(user, [toOrderItem(product, 1)]);
        const delivered = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.delivered
        });

        expect(await fulfillmentOrdersOf(String(pending._id))).toEqual([]);
        expect(await fulfillmentOrdersOf(String(delivered._id))).toEqual([]);
    });

    it('are made by the `paid` listener when the order is paid', async () => {
        wireDelivery();
        const user = await createUser();
        const product = await createProduct({ price: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.pending
        });
        // The listener is wired by the app's module registry; this stands in for its trigger.
        await orderService.markPaid(String(order._id));
        await settleOutboxNudges();

        const all = await fulfillmentOrderRepository.findByOrderId(String(order._id));
        const stored = await orderService.getById(String(order._id));

        expect(all).toHaveLength(1);
        expect(stored!.fulfillment?.remaining).toBe(1);
    });

    it('answer both lists empty for an order that is not paid, and carry their own actions once it is', async () => {
        const { user, order } = await processingOrderOf([1]);
        const pending = await createOrder(user, [toOrderItem(await createProduct(), 1)]);

        const early = await deliveryService.getForOrder(
            String(pending._id),
            asCustomer(String(user._id))
        );
        const own = await deliveryService.getForOrder(String(order._id), asAdmin());

        expect(early.success && early.data).toEqual({ fulfillmentOrders: [], shipments: [] });
        expect(own.success && own.data.fulfillmentOrders[0].actions.ship).toBe(true);
    });
});

describe('shipping a whole fulfillment order', () => {
    it('writes the shipment, moves the order, and sends the tracking email once', async () => {
        mockEnqueueEmail.mockClear();
        wireDelivery();
        const { order } = await processingOrderOf();

        const result = await shipFrom(String(order._id), { trackingCode: 'TRK-ABCDEF12' });
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        const [shipment] = await shipmentsOf(String(order._id));
        expect(shipment.status).toBe('shipped');
        expect(shipment.number).toBe(1);
        expect(shipment.trackingCode).toBe('TRK-ABCDEF12');
        expect(shipment.lines).toHaveLength(1);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.shipped);
        expect(stored!.fulfillment).toMatchObject({ shipped: true, remaining: 0, undelivered: 1 });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        expect(fulfillmentOrder.status).toBe('closed');
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [envelope, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(envelope.to).toBe(order.email);
        expect(template).toBe('delivery.shipment-shipped');
        expect(String(data?.tracking)).toContain('TRK-ABCDEF12');
        expect(data?.more).toBeUndefined();
    });

    it('still ships and mails the fallback name when the buyer lookup fails', async () => {
        mockEnqueueEmail.mockClear();
        wireDelivery();
        const { order } = await processingOrderOf();
        jest.spyOn(userService, 'getById').mockRejectedValueOnce(new Error('lookup unavailable'));

        const result = await shipFrom(String(order._id), { trackingCode: 'TRK-FALLBACK1' });
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(template).toBe('delivery.shipment-shipped');
        // Fallback name policy: `username ?? email`, and no username was ever resolved.
        expect(data?.greeting).toContain(order.email);
    });

    it('still ships when the tracking mail cannot be queued', async () => {
        wireDelivery();
        const { order } = await processingOrderOf();
        jest.spyOn(logger, 'error').mockImplementation(() => logger);
        mockEnqueueEmail.mockImplementation(() => {
            throw new Error('queue down');
        });

        const result = await shipFrom(String(order._id), { trackingCode: 'TRK-MAILDOWN1' });
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.shipped);
    });

    it('refuses an order that is not processing', async () => {
        const { order } = await processingOrderOf();
        await shipFrom(String(order._id), { trackingCode: 'TRK-FIRST0001' });

        const second = await shipFrom(String(order._id), { trackingCode: 'TRK-SECOND002' });

        // Everything left: the order is `shipped`, which no further shipment can leave from.
        expect(asReject(second).status).toBe(409);
        expect(asReject(second).errors[0].code).toBe('ORDER_NOT_PROCESSING');
    });

    it('refuses a `paid` order, which has not been started, and asks to start it', async () => {
        const { order } = await processingOrderOf([1], { status: OrderStatus.paid });

        const result = await shipFrom(String(order._id));

        expect(asReject(result).errors[0].code).toBe('ORDER_NOT_PROCESSING');
        expect(await shipmentsOf(String(order._id))).toEqual([]);
    });

    it('refuses a missing tracking code for a tracked method, and never writes the shipment', async () => {
        const { order } = await processingOrderOf([1], { shippingMethod: 'express' });

        const result = await shipFrom(String(order._id));

        expect(asReject(result).status).toBe(422);
        expect(asReject(result).errors[0].code).toBe('DELIVERY_TRACKING_CODE_REQUIRED');
        expect(await shipmentsOf(String(order._id))).toEqual([]);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        expect(fulfillmentOrder.status).toBe('open');
    });

    it('allows an untracked method to ship with no code at all', async () => {
        const { order } = await processingOrderOf([1], { shippingMethod: 'standard' });

        const result = await shipFrom(String(order._id));

        expect(result.success).toBe(true);
        const [shipment] = await shipmentsOf(String(order._id));
        expect(shipment.trackingCode).toBeUndefined();
    });

    it('takes each shipment’s units off the shelf as it leaves, and ends the hold with the last', async () => {
        const { order, products } = await processingOrderOf([3]);
        const orderId = String(order._id);
        const productId = String(products[0]._id);
        await inventoryService.reserveForOrder(orderId, [{ productId, quantity: 3 }]);
        await inventoryService.commitForOrder(orderId);

        await shipFrom(orderId, { lines: [{ productId, quantity: 1 }] });
        expect(await countersOf(productId)).toEqual({ onHand: 9, reserved: 2, available: 7 });
        expect(await inventoryService.isStockBoundToOrder(orderId)).toBe(true);

        await shipFrom(orderId);
        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        expect(await inventoryService.isStockBoundToOrder(orderId)).toBe(false);
        const rows = await inventoryService.listMovements({ productId, reason: 'ship' });
        expect(rows.items).toHaveLength(2);
    });
});

describe('shipping in parts', () => {
    it('keeps the order processing until nothing remains, then moves it once', async () => {
        mockEnqueueEmail.mockClear();
        wireDelivery();
        const { order, products } = await processingOrderOf([3]);
        const orderId = String(order._id);
        const productId = String(products[0]._id);

        const first = await shipFrom(orderId, { lines: [{ productId, quantity: 1 }] });
        await settleOutboxNudges();

        expect(first.success).toBe(true);
        let stored = await orderService.getById(orderId);
        expect(stored!.status).toBe(OrderStatus.processing);
        expect(stored!.fulfillment).toMatchObject({ shipped: true, remaining: 2, undelivered: 1 });
        expect(await fulfillmentOrdersOf(orderId).then(([first]) => first.status)).toBe(
            'in_progress'
        );
        expect(String(mockEnqueueEmail.mock.calls[0][2]?.more)).toContain('2');

        const rest = await shipFrom(orderId);

        expect(rest.success).toBe(true);
        stored = await orderService.getById(orderId);
        expect(stored!.status).toBe(OrderStatus.shipped);
        expect(await fulfillmentOrdersOf(orderId).then(([first]) => first.status)).toBe('closed');
        expect(await shipmentsOf(orderId).then((all) => all.map(({ number }) => number))).toEqual([
            1, 2
        ]);
    });

    it('refuses more than remains, a product that is not there, and the same product twice over remaining', async () => {
        const { order, products } = await processingOrderOf([2]);
        const orderId = String(order._id);
        const productId = String(products[0]._id);

        const tooMany = await shipFrom(orderId, { lines: [{ productId, quantity: 3 }] });
        const unknown = await shipFrom(orderId, {
            lines: [{ productId: '65dcdec2b18ad5e4bd597f01', quantity: 1 }]
        });
        const twice = await shipFrom(orderId, {
            lines: [
                { productId, quantity: 2 },
                { productId, quantity: 1 }
            ]
        });

        for (const result of [tooMany, unknown, twice]) {
            expect(asReject(result).status).toBe(422);
            expect(asReject(result).errors[0].code).toBe('DELIVERY_LINES_INVALID');
        }
        expect(await shipmentsOf(orderId)).toEqual([]);
    });

    it('lets two ships over the same remainder through only once', async () => {
        const { order, products } = await processingOrderOf([2]);
        const orderId = String(order._id);
        const productId = String(products[0]._id);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);

        const results = await Promise.allSettled([
            deliveryService.shipFulfillmentOrder(
                String(fulfillmentOrder._id),
                { lines: [{ productId, quantity: 2 }] },
                asAdmin(),
                admin
            ),
            deliveryService.shipFulfillmentOrder(
                String(fulfillmentOrder._id),
                { lines: [{ productId, quantity: 2 }] },
                asAdmin(),
                admin
            )
        ]);

        const answers = results.flatMap((one) => (one.status === 'fulfilled' ? [one.value] : []));
        expect(answers.filter((one) => one.success)).toHaveLength(1);
        expect(await shipmentsOf(orderId)).toHaveLength(1);
    });

    it('starts the withdrawal clock from the LAST arrival, once', async () => {
        const { order, products } = await processingOrderOf([2]);
        const orderId = String(order._id);
        const productId = String(products[0]._id);
        await shipFrom(orderId, { lines: [{ productId, quantity: 1 }] });
        await shipFrom(orderId);
        const [one, two] = await shipmentsOf(orderId);

        await deliveryService.deliverShipment(String(one._id), {}, asAdmin(), admin);
        let stored = await orderService.getById(orderId);
        expect(stored!.status).toBe(OrderStatus.shipped);
        expect(stored!.withdrawUntil).toBeUndefined();

        await deliveryService.deliverShipment(String(two._id), {}, asAdmin(), admin);
        stored = await orderService.getById(orderId);
        const last = await shipmentsOf(orderId).then((all) => all.at(-1)!);
        expect(stored!.status).toBe(OrderStatus.delivered);
        expect(stored!.withdrawUntil).toEqual(withdrawUntilFrom(last.deliveredAt!, 30));
    });
});

describe('delivering', () => {
    it('stamps the shipment and moves the order', async () => {
        wireDelivery();
        const { order } = await processingOrderOf();
        await shipFrom(String(order._id), { trackingCode: 'TRK-TESTFIXTURE' });
        const [shipment] = await shipmentsOf(String(order._id));
        await settleOutboxNudges();
        mockEnqueueEmail.mockClear();

        const result = await deliveryService.deliverShipment(
            String(shipment._id),
            {},
            asAdmin(),
            admin
        );
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.delivered);
        const [delivered] = await shipmentsOf(String(order._id));
        expect(delivered.status).toBe('delivered');
        expect(delivered.deliveredAt).toBeInstanceOf(Date);
        expect(mockEnqueueEmail).toHaveBeenCalledTimes(1);
        const [, template, data] = mockEnqueueEmail.mock.calls[0];
        expect(template).toBe('delivery.shipment-delivered');
        // The delivery that completed the order says until when the buyer may withdraw.
        expect(data?.withdraw).toBeDefined();
    });

    it("freezes the order's withdrawal deadline at the end of the 30th day after the delivery day", async () => {
        const { order } = await processingOrderOf();
        await shipFrom(String(order._id));
        const [shipment] = await shipmentsOf(String(order._id));

        await deliveryService.deliverShipment(String(shipment._id), {}, asAdmin(), admin);

        const [delivered] = await shipmentsOf(String(order._id));
        const stored = await orderService.getById(String(order._id));
        const deliveredOn = delivered.deliveredAt!;
        const endOfDeliveryDay =
            Date.UTC(
                deliveredOn.getUTCFullYear(),
                deliveredOn.getUTCMonth(),
                deliveredOn.getUTCDate() + 1
            ) - 1;
        expect(stored!.withdrawUntil!.getTime()).toBe(endOfDeliveryDay + 30 * 24 * 60 * 60 * 1000);
    });

    it('refuses a second delivery of the same shipment', async () => {
        const { order } = await processingOrderOf();
        await shipFrom(String(order._id));
        const [shipment] = await shipmentsOf(String(order._id));
        await deliveryService.deliverShipment(String(shipment._id), {}, asAdmin(), admin);

        const again = await deliveryService.deliverShipment(
            String(shipment._id),
            {},
            asAdmin(),
            admin
        );

        expect(asReject(again).status).toBe(409);
        expect(asReject(again).errors[0].code).toBe('DELIVERY_NOT_DELIVERABLE');
    });

    it('records a forced delivery against the override history', async () => {
        const { order } = await processingOrderOf();
        await shipFrom(String(order._id));
        const [shipment] = await shipmentsOf(String(order._id));

        const result = await deliveryService.deliverShipment(
            String(shipment._id),
            { forced: true, reason: 'carrier confirmed by phone' },
            asAdmin(),
            admin
        );

        expect(result.success).toBe(true);
        const stored = await orderService.getById(String(order._id));
        expect(await lastOverrideOf(String(order._id))).toMatchObject({
            text: 'carrier confirmed by phone',
            data: { mode: 'forced' }
        });
        expect(stored!.status).toBe(OrderStatus.delivered);
    });

    it('refuses a forced delivery from a caller without the override key, and one with no reason', async () => {
        const { order } = await processingOrderOf();
        await shipFrom(String(order._id));
        const [shipment] = await shipmentsOf(String(order._id));

        const noKey = await deliveryService.deliverShipment(
            String(shipment._id),
            { forced: true, reason: 'x' },
            asAdmin(),
            callerContextAs('customer')
        );
        const noReason = await deliveryService.deliverShipment(
            String(shipment._id),
            { forced: true },
            asAdmin(),
            admin
        );

        expect(asReject(noKey).status).toBe(403);
        expect(asReject(noReason).errors[0]).toMatchObject({
            code: 'DELIVERY_OVERRIDE_REASON_REQUIRED',
            details: { field: 'reason' }
        });
    });

    it('corrects a tracking code while the shipment is out, and not after it arrived', async () => {
        const { order } = await processingOrderOf();
        await shipFrom(String(order._id), { trackingCode: 'TRK-TYPO0001' });
        const [shipment] = await shipmentsOf(String(order._id));

        const fixed = await deliveryService.editShipmentTracking(
            String(shipment._id),
            'TRK-FIXED001',
            asAdmin(),
            admin
        );
        await deliveryService.deliverShipment(String(shipment._id), {}, asAdmin(), admin);
        const late = await deliveryService.editShipmentTracking(
            String(shipment._id),
            'TRK-LATE0001',
            asAdmin(),
            admin
        );

        expect(fixed.success && fixed.data.trackingCode).toBe('TRK-FIXED001');
        expect(asReject(late).status).toBe(409);
    });
});

describe('forced shipments', () => {
    it('lets an override holder ship from `paid` without `start`, and leaves a history row', async () => {
        const { order } = await processingOrderOf([1], { status: OrderStatus.paid });

        const result = await shipFrom(String(order._id), {
            forced: true,
            reason: 'no time to start'
        });

        expect(result.success).toBe(true);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.shipped);
        expect(await lastOverrideOf(String(order._id))).toMatchObject({
            text: 'no time to start',
            data: { mode: 'forced', from: OrderStatus.paid, to: OrderStatus.shipped }
        });
        expect(await shipmentsOf(String(order._id)).then(([first]) => first.forced)).toBe(true);
    });

    // The twin of the forced-deliver refusal: a forced ship skips the lifecycle and moves stock, so
    // the ship door asks for the override key itself, and for a reason, whatever the route let in.
    it('refuses a forced ship from a warehouse login, and one with no reason, and writes no shipment', async () => {
        const { order } = await processingOrderOf([1], { status: OrderStatus.paid });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        const forceShip = (
            input: Parameters<typeof deliveryService.shipFulfillmentOrder>[1],
            role: string
        ) =>
            deliveryService.shipFulfillmentOrder(
                String(fulfillmentOrder._id),
                input,
                asRole(role),
                callerContextAs(role)
            );

        const noKey = await forceShip({ forced: true, reason: 'because' }, 'warehouse');
        const noReason = await forceShip({ forced: true }, 'admin');

        expect(asReject(noKey).status).toBe(403);
        expect(asReject(noReason).errors[0]).toMatchObject({
            code: 'DELIVERY_OVERRIDE_REASON_REQUIRED',
            details: { field: 'reason' }
        });
        expect(await shipmentsOf(String(order._id))).toEqual([]);
        expect((await orderService.getById(String(order._id)))!.status).toBe(OrderStatus.paid);
    });

    it('records a forced partial shipment from `paid` as `processing`, still not shipped', async () => {
        const { order, products } = await processingOrderOf([2], { status: OrderStatus.paid });

        const result = await shipFrom(String(order._id), {
            forced: true,
            reason: 'partial',
            lines: [{ productId: String(products[0]._id), quantity: 1 }]
        });

        expect(result.success).toBe(true);
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.processing);
        expect(await lastOverrideOf(String(order._id))).toMatchObject({
            data: { from: OrderStatus.paid, to: OrderStatus.processing }
        });
    });
});

describe('digital fulfilment', () => {
    it('fulfils a digital-only order in one act: shipment born delivered, order delivered, clock from payment', async () => {
        const paidAt = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
        const order = await seedDigitalOrder(OrderStatus.processing, paidAt);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        expect(fulfillmentOrder.kind).toBe('digital');

        const result = await deliveryService.fulfillFulfillmentOrder(
            String(fulfillmentOrder._id),
            asAdmin(),
            admin
        );

        expect(result.success).toBe(true);
        const [shipment] = await shipmentsOf(String(order._id));
        expect(shipment.status).toBe('delivered');
        expect(shipment.trackingCode).toBeUndefined();
        const stored = await orderService.getById(String(order._id));
        expect(stored!.status).toBe(OrderStatus.delivered);
        expect(stored!.withdrawUntil).toEqual(withdrawUntilFrom(paidAt, 30));
    });

    it('mails only the arrival of a digital fulfilment, never "on its way"', async () => {
        wireDelivery();
        const order = await seedDigitalOrder(OrderStatus.processing, new Date());
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        mockEnqueueEmail.mockClear();

        await deliveryService.fulfillFulfillmentOrder(
            String(fulfillmentOrder._id),
            asAdmin(),
            admin
        );
        await settleOutboxNudges();

        expect(mockEnqueueEmail.mock.calls.map(([, template]) => template)).toEqual([
            'delivery.shipment-delivered'
        ]);
    });

    it('refuses to fulfil a physical fulfillment order, and to ship a digital one', async () => {
        const { order } = await processingOrderOf();
        const user = await createUser({ email: 'digital-buyer@example.com' });
        const digital = await createOrder(
            user,
            [toOrderItem(await createProduct({ requiresShipping: false }), 1)],
            { status: OrderStatus.processing }
        );
        const [physicalFo] = await fulfillmentOrdersOf(String(order._id));
        const [digitalFo] = await fulfillmentOrdersOf(String(digital._id));

        const fulfilPhysical = await deliveryService.fulfillFulfillmentOrder(
            String(physicalFo._id),
            asAdmin(),
            admin
        );
        const shipDigital = await deliveryService.shipFulfillmentOrder(
            String(digitalFo._id),
            {},
            asAdmin(),
            admin
        );

        expect(asReject(fulfilPhysical).errors[0].code).toBe('DELIVERY_NOT_DIGITAL');
        expect(asReject(shipDigital).errors[0].code).toBe('DELIVERY_NOT_PHYSICAL');
    });

    it('ships the digital lines of a mixed order together with the physical ones', async () => {
        const user = await createUser();
        const physical = await createProduct({ price: 10 });
        const digital = await createProduct({ price: 5, requiresShipping: false });
        const order = await createOrder(user, [toOrderItem(physical, 1), toOrderItem(digital, 1)], {
            status: OrderStatus.processing
        });

        const result = await shipFrom(String(order._id));

        expect(result.success).toBe(true);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        expect(fulfillmentOrder.kind).toBe('physical');
        expect(await shipmentsOf(String(order._id)).then(([first]) => first.lines)).toHaveLength(2);
    });
});

describe('the account export', () => {
    it('carries staff’s hold note and no staff id', async () => {
        const { user, order } = await processingOrderOf();
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        await deliveryService.holdFulfillmentOrder(
            String(fulfillmentOrder._id),
            { reason: 'high_risk', note: 'rang twice' },
            asAdmin('staff-42'),
            callerContextAs('admin', 'staff-42')
        );

        const section = deliveryModule.personalData.find(
            ({ section: name }) => name === 'fulfillmentOrders'
        );
        const exported = await section!.collect({
            userId: String(user._id),
            email: user.email,
            emailVerified: true
        });

        expect(exported).toMatchObject([{ holdReason: 'high_risk', holdNote: 'rang twice' }]);
        expect(JSON.stringify(exported)).not.toContain('staff-42');
    });
});

describe('holds', () => {
    it('stops a fulfillment order shipping, and a release lets it go again', async () => {
        const { order } = await processingOrderOf();
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        const id = String(fulfillmentOrder._id);

        const held = await deliveryService.holdFulfillmentOrder(
            id,
            { reason: 'high_risk', note: 'check' },
            asAdmin(),
            admin
        );
        const refused = await shipFrom(String(order._id));
        const stored = await orderService.getById(String(order._id));
        const released = await deliveryService.releaseFulfillmentOrder(id, asAdmin(), admin);
        const shipped = await shipFrom(String(order._id));

        expect(held.success && held.data.status).toBe('on_hold');
        expect(held.success && held.data.holdNote).toBe('check');
        expect(asReject(refused).errors[0].code).toBe('DELIVERY_NOT_SHIPPABLE');
        expect(stored!.fulfillment).toMatchObject({ remaining: 1, onHold: 1 });
        expect(released.success && released.data.status).toBe('open');
        expect(shipped.success).toBe(true);
    });

    it('refuses a hand release of a hold for stock, and holding what is not workable', async () => {
        const { order } = await processingOrderOf();
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        // The hold only the allocation of stock sets: written the way it would be.
        await fulfillmentOrderModel.updateOne(
            { _id: fulfillmentOrder._id },
            { $set: { status: 'on_hold', holdReason: 'awaiting_stock' } }
        );

        const release = await deliveryService.releaseFulfillmentOrder(
            String(fulfillmentOrder._id),
            asAdmin(),
            admin
        );
        const holdAgain = await deliveryService.holdFulfillmentOrder(
            String(fulfillmentOrder._id),
            { reason: 'other' },
            asAdmin(),
            admin
        );

        expect(asReject(release).errors[0].code).toBe('DELIVERY_NOT_RELEASABLE');
        expect(asReject(holdAgain).errors[0].code).toBe('DELIVERY_NOT_HOLDABLE');
    });

    it('never ships a held fulfillment order, forced or not', async () => {
        const { order } = await processingOrderOf([1], { status: OrderStatus.paid });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        await deliveryService.holdFulfillmentOrder(
            String(fulfillmentOrder._id),
            { reason: 'other' },
            asAdmin(),
            admin
        );

        const forced = await shipFrom(String(order._id), { forced: true, reason: 'now' });

        expect(asReject(forced).errors[0].code).toBe('DELIVERY_NOT_SHIPPABLE');
    });
});

describe('an order that is cancelled', () => {
    it('cancels every fulfillment order through the cancel event, and a redelivery changes nothing', async () => {
        wireDelivery();
        const { order } = await processingOrderOf([1], { status: OrderStatus.paid });
        const orderId = String(order._id);
        await fulfillmentOrdersOf(orderId);

        await orderService.cancelOnRequestById(orderId, asAdmin(), {}, admin);
        await settleOutboxNudges();
        await deliveryService.cancelAllForOrder(orderId);

        const all = await fulfillmentOrderRepository.findByOrderId(orderId);
        expect(all.map(({ status }) => status)).toEqual(['cancelled']);
        expect(all[0].lines[0]).toMatchObject({ cancelledQuantity: 1, shippedQuantity: 0 });
    });

    it('cannot be cancelled whole once a shipment left, and a ship cannot land on a cancelled order', async () => {
        const { order, products } = await processingOrderOf([2]);
        const orderId = String(order._id);
        await shipFrom(orderId, { lines: [{ productId: String(products[0]._id), quantity: 1 }] });

        const cancelled = await orderService.cancelOnRequestById(orderId, asAdmin(), {}, admin);

        expect(asReject(cancelled).status).toBe(409);
        const stored = await orderService.getById(orderId);
        expect(stored!.status).toBe(OrderStatus.processing);

        const other = await processingOrderOf([1], {}, 'other-buyer@example.com');
        const otherId = String(other.order._id);
        const [fulfillmentOrder] = await fulfillmentOrdersOf(otherId);
        await orderService.cancelOnRequestById(otherId, asAdmin(), {}, admin);
        const late = await deliveryService.shipFulfillmentOrder(
            String(fulfillmentOrder._id),
            {},
            asAdmin(),
            admin
        );
        expect(asReject(late).errors[0].code).toBe('DELIVERY_NOT_SHIPPABLE');
    });
});

/** A processing order of `quantity` units whose one fulfillment order waits for stock. */
const awaitingStock = async (quantity: number) => {
    const { order, products } = await processingOrderOf([quantity]);
    const orderId = String(order._id);
    const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
    // The hold the grouping rule makes for a preorder line, written the way it would be.
    await fulfillmentOrderModel.updateOne(
        { _id: fulfillmentOrder._id },
        { $set: { status: 'on_hold', holdReason: 'awaiting_stock' } }
    );
    return {
        orderId,
        fulfillmentOrderId: String(fulfillmentOrder._id),
        productId: String(products[0]._id)
    };
};

describe('a short stock delivery', () => {
    it('moves the allocated units to a new open fulfillment order and keeps the rest held', async () => {
        const { orderId, fulfillmentOrderId, productId } = await awaitingStock(3);

        const split = await deliveryService.splitForAllocation(fulfillmentOrderId, [
            { productId, quantity: 2 }
        ]);

        expect(split?.released).toMatchObject({ number: 2, status: 'open' });
        expect(split?.released.lines[0]).toMatchObject({ quantity: 2, shippedQuantity: 0 });
        expect(split?.held).toMatchObject({ status: 'on_hold', holdReason: 'awaiting_stock' });
        expect(split?.held?.lines[0]).toMatchObject({ quantity: 1 });
        const stored = await orderService.getById(orderId);
        // Three units, one still awaiting stock: the other two are free to ship.
        expect(stored?.fulfillment).toMatchObject({ remaining: 3, onHold: 1, awaitingStock: 1 });
    });

    it('lets the released units ship, while the held ones still cannot be released by hand', async () => {
        const { orderId, fulfillmentOrderId, productId } = await awaitingStock(3);
        const split = await deliveryService.splitForAllocation(fulfillmentOrderId, [
            { productId, quantity: 2 }
        ]);

        const shipped = await shipFrom(orderId, {}, 2);
        const release = await deliveryService.releaseFulfillmentOrder(
            fulfillmentOrderId,
            asAdmin(),
            admin
        );

        expect(split).toBeDefined();
        expect(shipped.success).toBe(true);
        expect(asReject(release).errors[0].code).toBe('DELIVERY_NOT_RELEASABLE');
        const stored = await orderService.getById(orderId);
        expect(stored?.status).toBe(OrderStatus.processing);
        expect(stored?.fulfillment).toMatchObject({ shipped: true, remaining: 1, onHold: 1 });
    });

    it('simply ends the hold when the arrival covers everything, with no second order', async () => {
        const { orderId, fulfillmentOrderId, productId } = await awaitingStock(2);

        const split = await deliveryService.splitForAllocation(fulfillmentOrderId, [
            { productId, quantity: 2 }
        ]);

        expect(split?.held).toBeUndefined();
        expect(split?.released).toMatchObject({ number: 1, status: 'open' });
        expect(split?.released.holdReason).toBeUndefined();
        expect(await fulfillmentOrdersOf(orderId)).toHaveLength(1);
    });

    it('refuses more than remains, an order not held for stock, and a missing one', async () => {
        const held = await awaitingStock(1);
        const plain = await processingOrderOf([1], {}, 'plain-split@example.com');
        const [plainFo] = await fulfillmentOrdersOf(String(plain.order._id));

        const tooMany = await deliveryService.splitForAllocation(held.fulfillmentOrderId, [
            { productId: held.productId, quantity: 2 }
        ]);
        const notHeld = await deliveryService.splitForAllocation(String(plainFo._id), [
            { productId: String(plain.products[0]._id), quantity: 1 }
        ]);
        const missing = await deliveryService.splitForAllocation('65dcdec2b18ad5e4bd597f01', []);

        expect([tooMany, notHeld, missing]).toEqual([undefined, undefined, undefined]);
        const [after] = await fulfillmentOrdersOf(held.orderId);
        expect(after.lines[0].quantity).toBe(1);
    });

    it('does nothing for a cancelled order', async () => {
        const { orderId, fulfillmentOrderId, productId } = await awaitingStock(2);
        await orderService.cancelOnRequestById(orderId, asAdmin(), {}, admin);

        const split = await deliveryService.splitForAllocation(fulfillmentOrderId, [
            { productId, quantity: 1 }
        ]);

        expect(split).toBeUndefined();
    });
});
