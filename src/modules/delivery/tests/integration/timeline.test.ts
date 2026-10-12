/**
 * @module
 * What delivery leaves on an order's timeline: one row per shipment, arrival, hold and release,
 * written in the act's own transaction, carrying ids and codes and never the hold's note. Real
 * Mongo, through the service's public door.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import {
    createOrder,
    seedDigitalOrder,
    toOrderItem,
    timelineOf
} from '@modules/orders/tests/factories';
import { OrderStatus } from '@types';
import {
    shipFulfillmentOrder,
    deliverShipment,
    fulfillFulfillmentOrder,
    holdFulfillmentOrder,
    releaseFulfillmentOrder,
    cancelAllForOrder
} from '@modules/delivery/services';
import { fulfillmentOrdersOf, shipmentsOf } from '@modules/delivery/tests/factories';
import { asAdmin, callerContextAs } from '@tests/callers';
import { resetDomainEvents } from '@kernel/events';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

afterEach(() => {
    jest.restoreAllMocks();
    resetDomainEvents();
    mockEnqueueEmail.mockClear();
});

/** The staff member behind every act below. */
const admin = callerContextAs('admin', 'admin-1');

/** A `processing` order of two units of one product, ready to ship. */
const processingOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)], {
        status: OrderStatus.processing
    });
    const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
    return { order, product, fulfillmentOrderId: String(fulfillmentOrder._id) };
};

/** The `[type, actor]` pairs of an order's timeline. */
const trail = (orderId: string) =>
    timelineOf(orderId).then((rows) => rows.map(({ type, actor }) => [type, actor]));

describe('shipping and delivering', () => {
    it('writes a shipment row per shipment, and the order`s own move only when the last unit left', async () => {
        const { order, product, fulfillmentOrderId } = await processingOrder();
        const orderId = String(order._id);

        await shipFulfillmentOrder(
            fulfillmentOrderId,
            { lines: [{ productId: String(product._id), quantity: 1 }], trackingCode: 'TRK-1' },
            asAdmin(),
            admin
        );
        expect(await trail(orderId)).toEqual([['shipment_shipped', 'admin-1']]);

        await shipFulfillmentOrder(fulfillmentOrderId, {}, asAdmin(), admin);
        // The shipment is the fact, the order's move its consequence: each pair in that order.
        expect(await trail(orderId)).toEqual([
            ['shipment_shipped', 'admin-1'],
            ['shipment_shipped', 'admin-1'],
            ['shipped', 'admin-1']
        ]);
    });

    it('carries the tracking code and the ids, and the arrival closes the order', async () => {
        const { order, fulfillmentOrderId } = await processingOrder();
        const orderId = String(order._id);
        await shipFulfillmentOrder(fulfillmentOrderId, { trackingCode: 'TRK-9' }, asAdmin(), admin);
        const [shipment] = await shipmentsOf(orderId);

        await deliverShipment(String(shipment._id), {}, asAdmin(), admin);

        const rows = await timelineOf(orderId);
        expect(rows.map(({ type }) => type)).toEqual([
            'shipment_shipped',
            'shipped',
            'shipment_delivered',
            'delivered'
        ]);
        expect(rows.find(({ type }) => type === 'shipment_shipped')?.data).toMatchObject({
            shipmentId: String(shipment._id),
            fulfillmentOrderId,
            trackingCode: 'TRK-9'
        });
    });

    it('writes nothing when the act is refused', async () => {
        const user = await createUser();
        const product = await createProduct();
        const order = await createOrder(user, [toOrderItem(product, 1)], {
            status: OrderStatus.processing
        });
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));
        await holdFulfillmentOrder(
            String(fulfillmentOrder._id),
            { reason: 'other' },
            asAdmin(),
            admin
        );
        const before = await timelineOf(String(order._id));

        const refused = await shipFulfillmentOrder(
            String(fulfillmentOrder._id),
            {},
            asAdmin(),
            admin
        );

        expect(refused.success).toBe(false);
        expect(await timelineOf(String(order._id))).toEqual(before);
    });

    it('writes the digital fulfilment as a shipment born delivered and the order delivered', async () => {
        const order = await seedDigitalOrder(OrderStatus.processing, new Date());
        const [fulfillmentOrder] = await fulfillmentOrdersOf(String(order._id));

        await fulfillFulfillmentOrder(String(fulfillmentOrder._id), asAdmin(), admin);

        const rows = await timelineOf(String(order._id));
        expect(rows.map(({ type }) => type)).toEqual([
            'shipment_shipped',
            'shipment_delivered',
            'delivered'
        ]);
    });
});

describe('holds', () => {
    it('writes the hold with its reason code and the release, never the note', async () => {
        const { order, fulfillmentOrderId } = await processingOrder();
        const orderId = String(order._id);

        await holdFulfillmentOrder(
            fulfillmentOrderId,
            { reason: 'high_risk', note: 'caller sounded odd' },
            asAdmin(),
            admin
        );
        await releaseFulfillmentOrder(fulfillmentOrderId, asAdmin(), admin);

        const rows = await timelineOf(orderId);
        expect(rows).toMatchObject([
            { type: 'fulfillment_held', actor: 'admin-1', data: { reason: 'high_risk' } },
            { type: 'fulfillment_released', actor: 'admin-1' }
        ]);
        expect(JSON.stringify(rows)).not.toContain('caller sounded odd');
    });
});

describe('an order cancelled whole', () => {
    it('adds no remainder rows: the order`s own `cancelled` already says it', async () => {
        const { order } = await processingOrder();
        const orderId = String(order._id);

        await cancelAllForOrder(orderId);

        expect(await timelineOf(orderId)).toEqual([]);
    });
});
