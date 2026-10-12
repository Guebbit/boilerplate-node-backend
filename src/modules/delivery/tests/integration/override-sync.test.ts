/**
 * @module
 * The admin status override and the fulfillment records, through the real events: forward to
 * `shipped` ships every remainder, forward to `delivered` delivers them too, all at the override's
 * own instant — the one `withdrawUntil` was counted from — and none of it sends a mail or announces
 * a public `shipment.*` event, because nothing left that anyone recorded.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService, withdrawUntilFrom } from '@modules/orders';
import { inventoryService } from '@modules/inventory';
import { OrderStatus } from '@types';
import { markDomainEventsWired, onDomainEvent, resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import deliveryModule from '@modules/delivery/module';
import { SHIPMENT_SHIPPED, SHIPMENT_DELIVERED } from '@modules/delivery/events';
import { shipFulfillmentOrder, syncWithOverride } from '@modules/delivery/services';
import { fulfillmentOrdersOf, shipmentsOf } from '@modules/delivery/tests/factories';
import { asAdmin } from '@tests/callers';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    resetDomainEvents();
    deliveryModule.subscribe();
    markDomainEventsWired();
    mockEnqueueEmail.mockClear();
});

afterEach(() => resetDomainEvents());

/** An order of 3 units, held and committed, `processing` — nothing shipped yet. */
const processingOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 10, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 3)], {
        status: OrderStatus.processing
    });
    const orderId = String(order._id);
    const productId = String(product._id);
    await inventoryService.reserveForOrder(orderId, [{ productId, quantity: 3 }]);
    await inventoryService.commitForOrder(orderId);
    await fulfillmentOrdersOf(orderId);
    return { orderId, productId };
};

/** Override the order, and let delivery hear about it. */
const override = async (orderId: string, to: OrderStatus) => {
    const result = await orderService.overrideStatus(
        orderId,
        to,
        'handed over at the counter',
        callerContextAs('admin', 'admin-1')
    );
    await settleOutboxNudges();
    return result;
};

describe('an override forward to shipped', () => {
    it('ships every remainder as one forced shipment at the override’s own instant, with no mail and no webhook event', async () => {
        const { orderId } = await processingOrder();
        const announced: string[] = [];
        onDomainEvent(SHIPMENT_SHIPPED, () => void announced.push('shipped'));
        onDomainEvent(SHIPMENT_DELIVERED, () => void announced.push('delivered'));

        await override(orderId, OrderStatus.shipped);

        const stored = await orderService.getById(orderId);
        const [shipment] = await shipmentsOf(orderId);
        expect(stored?.status).toBe(OrderStatus.shipped);
        expect(shipment).toMatchObject({ forced: true, status: 'shipped' });
        expect(shipment.lines[0].quantity).toBe(3);
        expect(shipment.shippedAt).toEqual(stored?.statusOverrides?.[0].at);
        expect(stored?.fulfillment).toMatchObject({ shipped: true, remaining: 0, undelivered: 1 });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
        expect(fulfillmentOrder.status).toBe('closed');
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
        expect(announced).toEqual([]);
    });

    it('takes only what had not shipped, and the shelf once', async () => {
        const { orderId, productId } = await processingOrder();
        const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
        await shipFulfillmentOrder(
            String(fulfillmentOrder._id),
            { lines: [{ productId, quantity: 1 }] },
            asAdmin(),
            callerContextAs('admin')
        );

        await override(orderId, OrderStatus.shipped);

        const shipments = await shipmentsOf(orderId);
        expect(shipments.map(({ number, forced }) => [number, forced])).toEqual([
            [1, false],
            [2, true]
        ]);
        expect(shipments[1].lines[0].quantity).toBe(2);
        expect(await countersOf(productId)).toEqual({ onHand: 7, reserved: 0, available: 7 });
        const rows = await inventoryService.listMovements({ productId, reason: 'ship' });
        // One row for the shipment, one for the override: the three units left exactly once.
        expect(rows.items.map(({ onHandDelta }) => onHandDelta).toSorted((a, b) => a - b)).toEqual([
            -2, -1
        ]);
    });

    it('does nothing the second time the event is delivered', async () => {
        const { orderId } = await processingOrder();
        await override(orderId, OrderStatus.shipped);
        const stored = await orderService.getById(orderId);

        await syncWithOverride(orderId, OrderStatus.shipped, stored!.statusOverrides![0].at);

        expect(await shipmentsOf(orderId)).toHaveLength(1);
    });
});

describe('an override forward to delivered', () => {
    it('delivers every shipment at the same instant the withdrawal deadline was counted from', async () => {
        const { orderId, productId } = await processingOrder();
        const [fulfillmentOrder] = await fulfillmentOrdersOf(orderId);
        await shipFulfillmentOrder(
            String(fulfillmentOrder._id),
            { lines: [{ productId, quantity: 1 }] },
            asAdmin(),
            callerContextAs('admin')
        );
        mockEnqueueEmail.mockClear();

        await override(orderId, OrderStatus.delivered);

        const stored = await orderService.getById(orderId);
        const [{ at }] = stored!.statusOverrides!;
        const shipments = await shipmentsOf(orderId);
        expect(stored?.status).toBe(OrderStatus.delivered);
        expect(shipments.map(({ status }) => status)).toEqual(['delivered', 'delivered']);
        // One instant for the order's deadline and for every arrival it is counted from.
        expect(shipments.map(({ deliveredAt }) => deliveredAt)).toEqual([at, at]);
        expect(stored?.withdrawUntil).toEqual(withdrawUntilFrom(at, 30));
        expect(stored?.fulfillment).toMatchObject({
            remaining: 0,
            undelivered: 0,
            lastDeliveredAt: at
        });
        expect(mockEnqueueEmail).not.toHaveBeenCalled();
    });

    it('leaves the fulfillment records alone for an override to processing', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.paid
        });
        await fulfillmentOrdersOf(String(order._id));

        await override(String(order._id), OrderStatus.processing);

        expect(await shipmentsOf(String(order._id))).toEqual([]);
        const [after] = await fulfillmentOrdersOf(String(order._id));
        expect(after.status).toBe('open');
    });
});
