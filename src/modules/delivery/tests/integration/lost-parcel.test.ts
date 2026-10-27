/**
 * @module
 * A parcel that will not arrive, and one that turns up after all. What is worth pinning: the lost
 * units reopen on the SAME fulfillment order and ship again through the ordinary door; the stock
 * hold is topped up with what the shelf has free and the rest is owed outside the backorder cap;
 * the order steps back `shipped → processing` and forward again with the replacement; the buyer is
 * told once, with the sentence staff wrote and never the note; and `deliver` takes a lost parcel
 * back exactly when every unit on it is still open. Real Mongo and a real outbox, the mailer
 * mocked at its queue.
 *
 * See: docs/modules/delivery.md#lost-in-transit
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { registerAuditSink, type AuditEntry } from '@infrastructure/observability/audit';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { orderService } from '@modules/orders';
import { asReject } from '@tests/response';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    readOrder,
    timelineOf,
    toOrderItem
} from '@modules/orders/tests/factories';
import { inventoryService } from '@modules/inventory';
import { reservationRepository, stockLevelRepository } from '@modules/inventory/tests/factories';
import { OrderStatus } from '@types';
import { deliveryService } from '@modules/delivery/services';
import { shipmentModel } from '@modules/delivery/model';
import { fulfillmentOrdersOf, shipmentsOf } from '@modules/delivery/tests/factories';
import deliveryModule from '@modules/delivery/module';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { markDomainEventsWired, resetDomainEvents } from '@kernel/events';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = jest.mocked(enqueueEmail);

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    deliveryModule.subscribe();
    markDomainEventsWired();
});

afterEach(() => {
    resetDomainEvents();
    jest.clearAllMocks();
});

/** The admin, as the caller of every act below. */
const admin = callerContextAs('admin');

/** The lost-parcel mails queued so far. */
const lostMails = () =>
    mockEnqueueEmail.mock.calls.filter(([, template]) => template === 'delivery.shipment-lost');

/** An order of `quantity` units, held, paid, `processing` and shipped in one parcel. */
const shippedOrder = async (quantity: number, onHand = 10, email = 'lost@example.com') => {
    const user = await createUser({ email });
    const product = await createProduct({ price: 10, onHand });
    const productId = String(product._id);
    const order = await createOrder(user, [toOrderItem(product, quantity)], {
        status: OrderStatus.processing
    });
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [{ productId, quantity }]);
    await inventoryService.commitForOrder(orderId);
    const [origin] = await fulfillmentOrdersOf(orderId);
    await deliveryService.shipFulfillmentOrder(
        String(origin._id),
        { trackingCode: 'TRK-LOST0001' },
        asAdmin(),
        admin
    );
    const [shipment] = await shipmentsOf(orderId);
    return { user, orderId, productId, shipmentId: String(shipment._id) };
};

/** Report the shipment lost as an admin, and let the outbox carry the news. */
const reportLost = async (
    shipmentId: string,
    input?: Parameters<typeof deliveryService.markShipmentLost>[1]
) => {
    const result = await deliveryService.markShipmentLost(
        shipmentId,
        input ?? { reason: 'lost' },
        asAdmin(),
        admin
    );
    await settleOutboxNudges();
    return result;
};

/** The order's status, as stored. */
const statusOf = (orderId: string) => readOrder(orderId).then((order) => order?.status);

/** The types of the order's timeline rows starting with the prefix. */
const timelineTypes = (orderId: string, prefix: string) =>
    timelineOf(orderId, prefix).then((rows) => rows.map(({ type }) => type));

/** The product's reserved units. */
const reservedOf = (productId: string) =>
    stockLevelRepository.findByProductId(productId).then((level) => level?.reserved);

/** The status of the order's hold. */
const holdStatusOf = (orderId: string) =>
    reservationRepository.findByOrderId(orderId).then((hold) => hold?.status);

/** The status of the order's first shipment. */
const firstShipmentStatus = (orderId: string) =>
    shipmentsOf(orderId).then(([first]) => first.status);

/** The order's shipment in the given status. */
const shipmentWith = (orderId: string, status: string) =>
    shipmentsOf(orderId).then((all) => all.find((one) => one.status === status)!);

/** Ship what remains of the order's first fulfillment order again, as staff do after a loss. */
const reship = async (orderId: string) => {
    const [origin] = await fulfillmentOrdersOf(orderId);
    return deliveryService.shipFulfillmentOrder(
        String(origin._id),
        { trackingCode: 'TRK-AGAIN0002' },
        asAdmin(),
        admin
    );
};

/** The stock level's three counters. */
const levelOf = async (productId: string) => {
    const level = await stockLevelRepository.findByProductId(productId);
    return {
        onHand: level?.onHand,
        reserved: level?.reserved,
        available: level?.available,
        backordered: level?.backordered
    };
};

describe('reporting a parcel lost', () => {
    it('reopens its units on the same fulfillment order and steps the order back to processing', async () => {
        const { orderId, shipmentId } = await shippedOrder(2);
        expect(await statusOf(orderId)).toBe(OrderStatus.shipped);

        const result = await reportLost(shipmentId, { reason: 'lost', note: 'carrier says gone' });

        expect(result.success && result.data.status).toBe('lost');
        expect(result.success && result.data.lostReason).toBe('lost');
        const all = await fulfillmentOrdersOf(orderId);
        expect(all).toHaveLength(1);
        expect(all[0].status).toBe('open');
        expect(all[0].lines[0]).toMatchObject({ quantity: 2, shippedQuantity: 0 });
        const order = await readOrder(orderId);
        expect(order?.status).toBe(OrderStatus.processing);
        // A lost shipment still counts as shipped: the whole-order cancel stays closed.
        expect(order?.fulfillment).toMatchObject({ shipped: true, remaining: 2, undelivered: 0 });
    });

    it('tops the hold up from the free shelf, leaving no owed claim when the shelf covers it', async () => {
        const { orderId, productId, shipmentId } = await shippedOrder(2, 10);
        expect(await levelOf(productId)).toMatchObject({ onHand: 8, reserved: 0, backordered: 0 });

        await reportLost(shipmentId);

        expect(await levelOf(productId)).toMatchObject({ onHand: 8, reserved: 2, backordered: 0 });
        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.status).toBe('committed');
        expect(hold?.items.map(({ quantity, kind }) => [quantity, kind])).toEqual([[2, 'stock']]);
    });

    it('records the loss once: timeline, audit, event and mail', async () => {
        const entries: AuditEntry[] = [];
        registerAuditSink((entry) => entries.push(entry));
        const { orderId, shipmentId } = await shippedOrder(1);

        await reportLost(shipmentId, { reason: 'damaged', note: 'box crushed', message: 'Sorry!' });

        expect(await timelineTypes(orderId, 'shipment_lost')).toEqual(['shipment_lost']);
        const audit = entries.filter(({ action }) => action === 'admin.shipment.lost');
        expect(audit).toHaveLength(1);
        expect(audit[0].metadata).toEqual({ shipmentId, reason: 'damaged' });
        expect(JSON.stringify(audit)).not.toMatch(/box crushed|Sorry/);
        expect(await outboxEventModel.countDocuments({ name: 'shipment.lost' })).toBe(1);
        expect(lostMails()).toHaveLength(1);
    });

    it('never creates an invoice, a new order, or charges the shipping again', async () => {
        const { orderId, shipmentId } = await shippedOrder(1);
        const before = await readOrder(orderId);

        await reportLost(shipmentId);

        const after = await readOrder(orderId);
        expect(after?.shippingCost).toBe(before?.shippingCost);
        expect(await outboxEventModel.countDocuments({ name: 'order.created' })).toBe(0);
        expect(await outboxEventModel.countDocuments({ name: /^invoice/ })).toBe(0);
    });

    it('lets staff ship the units again, and the order ends delivered with its clock from the replacement', async () => {
        const { orderId, shipmentId } = await shippedOrder(2);
        await reportLost(shipmentId);

        const second = await reship(orderId);
        expect(second.success).toBe(true);
        expect(await statusOf(orderId)).toBe(OrderStatus.shipped);
        const replacement = await shipmentWith(orderId, 'shipped');
        await deliveryService.deliverShipment(String(replacement._id), {}, asAdmin(), admin);

        const order = await readOrder(orderId);
        expect(order?.status).toBe(OrderStatus.delivered);
        const delivered = await shipmentWith(orderId, 'delivered');
        expect(order?.withdrawUntil?.getTime()).toBeGreaterThanOrEqual(
            delivered.deliveredAt!.getTime()
        );
        const [origin] = await fulfillmentOrdersOf(orderId);
        expect(origin.status).toBe('closed');
        expect(origin.lines[0]).toMatchObject({ quantity: 2, shippedQuantity: 2 });
    });

    it('leaves a processing order processing and moves nothing else when other units were still to ship', async () => {
        const user = await createUser({ email: 'part@example.com' });
        const product = await createProduct({ price: 10, onHand: 10 });
        const productId = String(product._id);
        const order = await createOrder(user, [toOrderItem(product, 3)], {
            status: OrderStatus.processing
        });
        const orderId = String(order._id);
        await inventoryService.reserveForOrder(orderId, [{ productId, quantity: 3 }]);
        await inventoryService.commitForOrder(orderId);
        const [origin] = await fulfillmentOrdersOf(orderId);
        await deliveryService.shipFulfillmentOrder(
            String(origin._id),
            { lines: [{ productId, quantity: 1 }] },
            asAdmin(),
            admin
        );
        const [shipment] = await shipmentsOf(orderId);

        await reportLost(String(shipment._id));

        expect(await statusOf(orderId)).toBe(OrderStatus.processing);
        const [after] = await fulfillmentOrdersOf(orderId);
        expect(after.lines[0]).toMatchObject({ quantity: 3, shippedQuantity: 0 });
    });
});

describe('the admin override after a loss', () => {
    it('still moves the reopened order forward, shipping the reopened units as one forced shipment', async () => {
        const { orderId, shipmentId } = await shippedOrder(2);
        await reportLost(shipmentId);

        const result = await orderService.overrideStatus(
            orderId,
            OrderStatus.shipped,
            'handed over at the counter',
            callerContextAs('admin', 'admin-1')
        );
        await settleOutboxNudges();

        expect(result.success).toBe(true);
        expect(await statusOf(orderId)).toBe(OrderStatus.shipped);
        const all = await shipmentsOf(orderId);
        expect(all.map(({ status, forced }) => [status, forced])).toEqual([
            ['lost', false],
            ['shipped', true]
        ]);
    });
});

describe('what it refuses', () => {
    it('a shipment already delivered, already lost, or on a cancelled order', async () => {
        const delivered = await shippedOrder(1, 10, 'd@example.com');
        await deliveryService.deliverShipment(delivered.shipmentId, {}, asAdmin(), admin);
        const lost = await shippedOrder(1, 10, 'l@example.com');
        await reportLost(lost.shipmentId);
        const cancelled = await shippedOrder(1, 10, 'c@example.com');
        await forceOrderStatus(cancelled.orderId, OrderStatus.cancelled);

        const results = await Promise.all([
            deliveryService.markShipmentLost(
                delivered.shipmentId,
                { reason: 'lost' },
                asAdmin(),
                admin
            ),
            deliveryService.markShipmentLost(lost.shipmentId, { reason: 'lost' }, asAdmin(), admin),
            deliveryService.markShipmentLost(
                cancelled.shipmentId,
                { reason: 'lost' },
                asAdmin(),
                admin
            )
        ]);

        for (const result of results) {
            expect(asReject(result).status).toBe(409);
            expect(asReject(result).errors[0].code).toBe('DELIVERY_NOT_LOSABLE');
        }
    });

    it('a second report racing the first: exactly one tops the stock up', async () => {
        const { productId, shipmentId } = await shippedOrder(2);

        const results = await Promise.all([
            deliveryService.markShipmentLost(shipmentId, { reason: 'lost' }, asAdmin(), admin),
            deliveryService.markShipmentLost(shipmentId, { reason: 'lost' }, asAdmin(), admin)
        ]);

        expect(results.filter(({ success }) => success)).toHaveLength(1);
        expect(await reservedOf(productId)).toBe(2);
    });

    it('answers 404 for a shipment that does not exist', async () => {
        const result = await deliveryService.markShipmentLost(
            '64b64c4f4f4f4f4f4f4f4f4f',
            { reason: 'lost' },
            asAdmin(),
            admin
        );

        expect(asReject(result).status).toBe(404);
    });

    it('offers the action to staff on a shipped parcel only, and not to the buyer', async () => {
        const { user, orderId, shipmentId } = await shippedOrder(1);
        const staffBefore = await deliveryService.getShipment(shipmentId, asAdmin());
        const buyer = await deliveryService.getShipment(shipmentId, asCustomer(String(user._id)));
        await reportLost(shipmentId);
        const staffAfter = await deliveryService.getShipment(shipmentId, asAdmin());

        expect(staffBefore.success && staffBefore.data.actions.markLost).toBe(true);
        expect(buyer.success && buyer.data.actions.markLost).toBe(false);
        expect(staffAfter.success && staffAfter.data.actions.markLost).toBe(false);
        expect(orderId).toBeDefined();
    });
});

describe('what the buyer is told', () => {
    it('mails once, with staff’s sentence in the message and never the note', async () => {
        const { shipmentId } = await shippedOrder(1);

        await reportLost(shipmentId, {
            reason: 'lost',
            note: 'internal: carrier claim opened',
            message: 'We are sending a new one on Monday.'
        });

        expect(lostMails()).toHaveLength(1);
        const [[envelope, , data]] = lostMails();
        expect(envelope.to).toBe('lost@example.com');
        expect(data?.message).toBe('We are sending a new one on Monday.');
        expect(JSON.stringify(data)).not.toMatch(/carrier claim/);
    });

    it('mails with no quote when staff wrote no message', async () => {
        const { shipmentId } = await shippedOrder(1);

        await reportLost(shipmentId);

        expect(lostMails()).toHaveLength(1);
        expect(lostMails()[0][2]?.message).toBe('');
    });

    it('shows the buyer the message and the reason, but not the note', async () => {
        const { user, shipmentId } = await shippedOrder(1);
        await reportLost(shipmentId, {
            reason: 'lost',
            note: 'staff only',
            message: 'Hello buyer'
        });

        const buyer = await deliveryService.getShipment(shipmentId, asCustomer(String(user._id)));
        const staff = await deliveryService.getShipment(shipmentId, asAdmin());

        expect(buyer.success && buyer.data).toMatchObject({
            status: 'lost',
            lostReason: 'lost',
            lostMessage: 'Hello buyer'
        });
        expect(buyer.success && buyer.data.lostNote).toBeUndefined();
        expect(staff.success && staff.data.lostNote).toBe('staff only');
    });

    it('carries the reason code and no free text on the webhook event', async () => {
        const { shipmentId } = await shippedOrder(1);
        await reportLost(shipmentId, { reason: 'damaged', message: 'free text', note: 'n' });

        const [event] = await outboxEventModel.find({ name: 'shipment.lost' }).lean().exec();
        const projected = deliveryModule.publicEvents['shipment.lost'].toPublicEvent(
            event.payload as never
        );

        expect(projected).toEqual({
            eventType: 'shipment.lost',
            data: expect.objectContaining({ reason: 'damaged', shipmentId })
        });
        expect(JSON.stringify(projected)).not.toMatch(/free text/);
    });
});

describe('the retention of the note', () => {
    it('unsets the note on a quiet shipment and keeps the message', async () => {
        const { shipmentId } = await shippedOrder(1);
        await reportLost(shipmentId, { reason: 'lost', note: 'n', message: 'm' });
        const far = new Date(Date.now() + 3650 * 86_400_000);

        const scrubbed = await deliveryService.scrubLostNotes(far);

        expect(scrubbed).toBe(1);
        const stored = await shipmentModel.findById(shipmentId).lean().exec();
        expect(stored?.lostNote).toBeUndefined();
        expect(stored?.lostMessage).toBe('m');
        expect(await deliveryService.scrubLostNotes(far)).toBe(0);
    });
});

describe('a short shelf', () => {
    it('reserves what is free and owes the rest on a fulfillment order of its own, outside the cap', async () => {
        // 3 bought of 4 on the shelf: 1 is left after the parcel went out.
        const { orderId, productId, shipmentId } = await shippedOrder(3, 4);
        expect(await levelOf(productId)).toMatchObject({ onHand: 1, reserved: 0, backordered: 0 });

        await reportLost(shipmentId);

        expect(await levelOf(productId)).toMatchObject({ reserved: 1, backordered: 2 });
        const all = await fulfillmentOrdersOf(orderId);
        expect(all.map(({ number, status }) => [number, status])).toEqual([
            [1, 'open'],
            [2, 'on_hold']
        ]);
        // MONEY: the origin's line drops by the owed part, so the order never holds more than bought.
        expect(all[0].lines[0]).toMatchObject({ quantity: 1, shippedQuantity: 0 });
        expect(all[1]).toMatchObject({ holdReason: 'awaiting_stock', cause: 'backorder' });
        expect(all[1].lines[0]).toMatchObject({ quantity: 2 });
        expect(all[1].agreedAt).toBeDefined();
        expect(all[1].expectedAt).toBeDefined();
        expect(all[1].defaulted).toBe(true);
        const hold = await reservationRepository.findByOrderId(orderId);
        expect(hold?.items.map(({ quantity, kind }) => [quantity, kind])).toEqual([
            [1, 'stock'],
            [2, 'backorder']
        ]);
    });

    it('tells the buyer what is owed and when it is expected', async () => {
        const { shipmentId } = await shippedOrder(3, 4);

        await reportLost(shipmentId);

        const data = lostMails()[0][2];
        expect(data?.owedLines).toEqual([
            '2 × ' + (data?.owedLines as string[])[0].split(' × ', 2)[1]
        ]);
        expect(String(data?.owedIntro)).not.toBe('');
    });

    it('owes every unit when the shelf is empty, and keeps the origin order from reading as cancelled', async () => {
        const { orderId, productId, shipmentId } = await shippedOrder(2, 2);

        await reportLost(shipmentId);

        expect(await levelOf(productId)).toMatchObject({ reserved: 0, backordered: 2 });
        const all = await fulfillmentOrdersOf(orderId);
        expect(all[0].status).toBe('closed');
        expect(all[1]).toMatchObject({ status: 'on_hold' });
        const order = await readOrder(orderId);
        expect(order?.status).toBe(OrderStatus.processing);
        expect(order?.fulfillment).toMatchObject({ remaining: 2, awaitingStock: 2 });
    });

    it('never takes units held for another order', async () => {
        const { productId, shipmentId } = await shippedOrder(2, 3);
        // One free unit is now held for a stranger's order.
        const stranger = await createUser({ email: 'stranger@example.com' });
        const other = await createOrder(
            stranger,
            [toOrderItem(await createProduct({ price: 1 }), 1)],
            { status: OrderStatus.paid }
        );
        await inventoryService.reserveForOrder(String(other._id), [{ productId, quantity: 1 }]);

        await reportLost(shipmentId);

        // The stranger keeps their unit; the lost parcel got none from the shelf and owes both.
        expect(await levelOf(productId)).toMatchObject({ reserved: 1, backordered: 2 });
    });

    it('still records the loss for a product that was deleted', async () => {
        const { productId, shipmentId, orderId } = await shippedOrder(1);
        await stockLevelRepository.deleteOne(
            (await stockLevelRepository.findByProductId(productId))!
        );

        const result = await reportLost(shipmentId);

        expect(result.success && result.data.status).toBe('lost');
        expect(await fulfillmentOrdersOf(orderId)).toHaveLength(1);
    });

    it('serves the owed claim when stock arrives: the owed order is released to ship', async () => {
        const { orderId, productId, shipmentId } = await shippedOrder(3, 4);
        await reportLost(shipmentId);

        await inventoryService.receive(productId, 2, undefined, testCallerContext);
        await settleOutboxNudges();

        const all = await fulfillmentOrdersOf(orderId);
        expect(all.filter(({ status }) => status === 'on_hold')).toHaveLength(0);
        expect(await levelOf(productId)).toMatchObject({ backordered: 0 });
    });
});

describe('the lost parcel arrives after all', () => {
    it('is recorded as arrived while every unit is still open, with the history kept', async () => {
        const { orderId, productId, shipmentId } = await shippedOrder(2);
        await reportLost(shipmentId, { reason: 'lost', message: 'm' });
        const view = await deliveryService.getShipment(shipmentId, asAdmin());
        expect(view.success && view.data.actions.deliver).toBe(true);

        const result = await deliveryService.deliverShipment(shipmentId, {}, asAdmin(), admin);
        await settleOutboxNudges();

        expect(result.success && result.data.status).toBe('delivered');
        expect(result.success && result.data.lostReason).toBe('lost');
        const order = await readOrder(orderId);
        expect(order?.status).toBe(OrderStatus.delivered);
        expect(order?.withdrawUntil).toBeDefined();
        const [origin] = await fulfillmentOrdersOf(orderId);
        expect(origin.status).toBe('closed');
        expect(origin.lines[0]).toMatchObject({ quantity: 2, shippedQuantity: 2 });
        // The top-up is given back; the hold ends shipped, not released.
        expect(await levelOf(productId)).toMatchObject({ reserved: 0 });
        expect(await holdStatusOf(orderId)).toBe('shipped');
    });

    it('closes the owed fulfillment order with no refund and releases the claim', async () => {
        const { orderId, productId, shipmentId } = await shippedOrder(3, 4);
        await reportLost(shipmentId);

        const result = await deliveryService.deliverShipment(shipmentId, {}, asAdmin(), admin);

        expect(result.success && result.data.status).toBe('delivered');
        expect(await levelOf(productId)).toMatchObject({ reserved: 0, backordered: 0 });
        const all = await fulfillmentOrdersOf(orderId);
        expect(all[0].lines[0]).toMatchObject({ quantity: 3, shippedQuantity: 3 });
        expect(all[1]).toMatchObject({ status: 'cancelled', cancelReason: 'found' });
        expect(await statusOf(orderId)).toBe(OrderStatus.delivered);
    });

    it('is refused when the units were already shipped again, naming DELIVERY_LOST_SUPERSEDED', async () => {
        const { orderId, shipmentId } = await shippedOrder(2);
        await reportLost(shipmentId);
        await reship(orderId);

        const view = await deliveryService.getShipment(shipmentId, asAdmin());
        const result = await deliveryService.deliverShipment(shipmentId, {}, asAdmin(), admin);

        expect(view.success && view.data.actions.deliver).toBe(false);
        expect(asReject(result).status).toBe(409);
        expect(asReject(result).errors[0].code).toBe('DELIVERY_LOST_SUPERSEDED');
        expect(await firstShipmentStatus(orderId)).toBe('lost');
    });

    it('is refused when only part of the units was shipped again', async () => {
        const { orderId, productId, shipmentId } = await shippedOrder(2);
        await reportLost(shipmentId);
        const [origin] = await fulfillmentOrdersOf(orderId);
        await deliveryService.shipFulfillmentOrder(
            String(origin._id),
            { lines: [{ productId, quantity: 1 }] },
            asAdmin(),
            admin
        );

        const result = await deliveryService.deliverShipment(shipmentId, {}, asAdmin(), admin);

        expect(asReject(result).errors[0].code).toBe('DELIVERY_LOST_SUPERSEDED');
    });

    it('is refused when the owed units were cancelled', async () => {
        const { orderId, shipmentId } = await shippedOrder(3, 4);
        await reportLost(shipmentId);
        const all = await fulfillmentOrdersOf(orderId);
        await shipmentModel.db
            .collection('fulfillmentorders')
            .updateOne({ _id: all[1]._id }, { $set: { 'lines.0.cancelledQuantity': 2 } });

        const result = await deliveryService.deliverShipment(shipmentId, {}, asAdmin(), admin);

        expect(asReject(result).errors[0].code).toBe('DELIVERY_LOST_SUPERSEDED');
    });

    it('lets staff correct the tracking code of a lost parcel', async () => {
        const { shipmentId } = await shippedOrder(1);
        await reportLost(shipmentId);

        const result = await deliveryService.editShipmentTracking(
            shipmentId,
            'TRK-CORRECT01',
            asAdmin(),
            admin
        );

        expect(result.success && result.data.trackingCode).toBe('TRK-CORRECT01');
    });
});
