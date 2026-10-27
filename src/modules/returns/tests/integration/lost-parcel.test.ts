/**
 * @module
 * What a lost parcel does to the buyer's remedies: the units it carried are open again on the
 * same fulfillment order, so the buyer can still cancel them (refunded, stock given back), the
 * goods that never arrived cannot be returned, and a replacement can be returned once — never
 * twice the quantity bought. Real database, the real `fake` payment provider.
 *
 * See: docs/modules/delivery.md#lost-in-transit
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    readOrder,
    timelineOf,
    toOrderItem
} from '@modules/orders/tests/factories';
import { reservationRepository } from '@modules/inventory/tests/factories';
import { asReject } from '@tests/response';
import { fulfillmentOrdersOf, shipmentsOf } from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery';
import { OrderStatus } from '@types';
import { inventoryService } from '@modules/inventory';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments';
import returnsModule from '../../module';
import { returnService } from '../../services';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, returnsModule]);
});

afterEach(() => {
    resetDomainEvents();
});

/** A distinct address per customer. */
let customers = 0;

/** The admin, as the caller of every staff act below. */
const admin = callerContextAs('admin');

/**
 * Two shirts (30.00) and a mug (10.00) with 5.00 delivery — 75.00, paid by card, the units held
 * and sold for real, `processing` — shipped in ONE parcel.
 */
const shippedParcel = async () => {
    customers += 1;
    const user = await createUser({ email: `lost-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: 10, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)], {
        shippingMethod: 'standard',
        shippingCost: 5
    });
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(user.id),
        callerContextAs('customer', user.id)
    );
    await forceOrderStatus(orderId, OrderStatus.processing);
    const [origin] = await fulfillmentOrdersOf(orderId);
    const shipped = await deliveryService.shipFulfillmentOrder(
        String(origin._id),
        {},
        asAdmin(),
        admin
    );
    if (!shipped.success) throw new Error('ship refused');
    const [shipment] = await shipmentsOf(orderId);
    return {
        user,
        shirt,
        mug,
        orderId,
        fulfillmentOrderId: String(origin._id),
        shipmentId: String(shipment._id)
    };
};

type Parcel = Awaited<ReturnType<typeof shippedParcel>>;

/** Staff report the parcel lost. */
const lose = (parcel: Parcel) =>
    deliveryService.markShipmentLost(parcel.shipmentId, { reason: 'lost' }, asAdmin(), admin);

/** What the payment has refunded so far. */
const refundsOf = async (orderId: string) => {
    const result = await paymentService.getForOrder(orderId, asAdmin());
    if (!result.success) throw new Error('no payment');
    return result.data.refunds.map(({ reason, amount }) => ({ reason, amount }));
};

describe('cancelling what a lost parcel carried', () => {
    it('refunds those units with the delivery, gives their stock back, and records no second refund', async () => {
        const parcel = await shippedParcel();
        await lose(parcel);
        // The parcel's top-up holds the shelf units again until the buyer chooses.
        expect(await countersOf(parcel.shirt._id)).toEqual({
            onHand: 8,
            reserved: 2,
            available: 6
        });

        const cancelled = await returnService.createReturn(
            {
                orderId: parcel.orderId,
                reason: 'withdrawal',
                kind: 'cancellation',
                fulfillmentOrderId: parcel.fulfillmentOrderId
            },
            asCustomer(parcel.user.id),
            callerContextAs('customer', parcel.user.id)
        );

        expect(cancelled.success && cancelled.data.refundAmount).toBe(75);
        expect(await refundsOf(parcel.orderId)).toEqual([{ reason: 'cancellation', amount: 75 }]);
        expect(await countersOf(parcel.shirt._id)).toEqual({
            onHand: 8,
            reserved: 0,
            available: 8
        });
        expect(await countersOf(parcel.mug._id)).toEqual({
            onHand: 9,
            reserved: 0,
            available: 9
        });
    });
});

/** Cancel what the lost parcel carried, as the buyer does. */
const cancelRemainder = (parcel: Parcel) =>
    returnService.createReturn(
        {
            orderId: parcel.orderId,
            reason: 'withdrawal',
            kind: 'cancellation',
            fulfillmentOrderId: parcel.fulfillmentOrderId
        },
        asCustomer(parcel.user.id),
        callerContextAs('customer', parcel.user.id)
    );

describe('settling an order whose every parcel was lost and refunded', () => {
    it('ends cancelled with cause lost: no clocks, no delivered row, one refund, nothing reserved', async () => {
        const parcel = await shippedParcel();
        await lose(parcel);

        await cancelRemainder(parcel);

        const order = await readOrder(parcel.orderId);
        expect(order?.status).toBe(OrderStatus.cancelled);
        expect(order?.paymentStatus).toBe('refunded');
        expect(order?.withdrawUntil).toBeUndefined();
        expect(order?.conformityUntil).toBeUndefined();
        const rows = await timelineOf(parcel.orderId);
        // The one real `shipped` row is the parcel leaving; the settle adds none, nor a `delivered`.
        expect(rows.filter(({ type }) => type === 'shipped')).toHaveLength(1);
        expect(rows.some(({ type }) => type === 'delivered')).toBe(false);
        const cancelledRows = rows.filter(({ type }) => type === 'cancelled');
        expect(cancelledRows).toHaveLength(1);
        expect(cancelledRows[0].actor).toBeUndefined();
        expect(cancelledRows[0].data).toMatchObject({ by: 'system', cause: 'lost', refund: false });
        expect(await refundsOf(parcel.orderId)).toEqual([{ reason: 'cancellation', amount: 75 }]);
        expect(await reservationRepository.findByOrderId(parcel.orderId)).toMatchObject({
            status: 'released'
        });
        expect(await countersOf(parcel.shirt._id)).toEqual({
            onHand: 8,
            reserved: 0,
            available: 8
        });
    });

    it('answers a parcel found later with DELIVERY_NOT_DELIVERABLE and offers no deliver action', async () => {
        const parcel = await shippedParcel();
        await lose(parcel);
        await cancelRemainder(parcel);

        const view = await deliveryService.getShipment(parcel.shipmentId, asAdmin());
        const found = await deliveryService.deliverShipment(
            parcel.shipmentId,
            {},
            asAdmin(),
            admin
        );

        expect(view.success && view.data.actions.deliver).toBe(false);
        expect(asReject(found).errors[0].code).toBe('DELIVERY_NOT_DELIVERABLE');
    });

    it('stays delivered when another parcel did arrive', async () => {
        const parcel = await shippedParcel();
        // The shirts go out again and arrive; only the mug stays lost and is then cancelled.
        await lose(parcel);
        await deliveryService.shipFulfillmentOrder(
            parcel.fulfillmentOrderId,
            { lines: [{ productId: String(parcel.shirt._id), quantity: 2 }] },
            asAdmin(),
            admin
        );
        const shipments = await shipmentsOf(parcel.orderId);
        const replacement = shipments.find(({ status }) => status === 'shipped');
        await deliveryService.deliverShipment(String(replacement?._id), {}, asAdmin(), admin);

        await cancelRemainder(parcel);

        const order = await readOrder(parcel.orderId);
        expect(order?.status).toBe(OrderStatus.delivered);
        expect(order?.withdrawUntil).toBeDefined();
    });
});

describe('returning goods after a loss', () => {
    it('cannot return what never arrived: nothing counts as shipped while the parcel is lost', async () => {
        const parcel = await shippedParcel();
        await lose(parcel);

        const outcome = await returnService.createReturn(
            { orderId: parcel.orderId, reason: 'withdrawal' },
            asCustomer(parcel.user.id),
            callerContextAs('customer', parcel.user.id)
        );

        expect(outcome.success).toBe(false);
        expect(await deliveryService.shippedQuantities(parcel.orderId)).toEqual([]);
    });

    it('counts the replacement once: the shipped quantity is what was bought, not twice that', async () => {
        const parcel = await shippedParcel();
        await lose(parcel);
        const [origin] = await fulfillmentOrdersOf(parcel.orderId);
        await deliveryService.shipFulfillmentOrder(String(origin._id), {}, asAdmin(), admin);

        const shipped = await deliveryService.shippedQuantities(parcel.orderId);

        expect(shipped.map(({ productId, quantity }) => [productId, quantity]).toSorted()).toEqual(
            [
                [String(parcel.shirt._id), 2],
                [String(parcel.mug._id), 1]
            ].toSorted()
        );
    });
});
