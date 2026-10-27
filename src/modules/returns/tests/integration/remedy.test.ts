/**
 * @module
 * The remedy ladder for a faulty or wrong item (Directive 2019/771 Art. 13): staff give a
 * replacement or a repair instead of the money. A replacement reopens the returned units on the
 * SAME order and ships them again through the ordinary door; a repair pushes the guarantee out by
 * 12 months, once. Neither moves money, and the units are in the buyer's hands again, so they stay
 * returnable. A withdrawal never has a choice. Real database, the real `fake` payment provider.
 *
 * See: docs/modules/returns.md#what-the-customer-gets-back
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { settleOutboxNudges } from '@kernel/outbox';
import { resetDomainEvents } from '@kernel/events';
import { asAdmin, asCustomer, callerContextAs, testCallerContext } from '@tests/callers';
import { asReject } from '@tests/response';
import { OrderStatus } from '@types';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import { createOrder, readOrder, timelineOf, toOrderItem } from '@modules/orders/tests/factories';
import {
    carryOrderTo,
    deliverEverything,
    fulfillmentOrdersOf,
    setFirstLineShipped
} from '@modules/delivery/tests/factories';
import { deliveryService } from '@modules/delivery';
import { inventoryService } from '@modules/inventory';
import { paymentService } from '@modules/payments';
import paymentsModule from '@modules/payments/module';
import returnsModule from '../../module';
import { returnService } from '../../services';
import { returnRepository } from '../../repository';

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
 * A buyer of two shirts (30.00 each) who paid by card and has received them, and an approved
 * return of both for the given reason, ready to receive.
 * @param reason - why the shirts come back
 * @param onHand - the shelf before the sale
 * @param preferredRemedy - what the buyer asked for, when they did
 */
const approvedReturn = async (
    reason: 'defective' | 'withdrawal' = 'defective',
    onHand = 10,
    preferredRemedy?: 'repair' | 'replace' | 'refund'
) => {
    customers += 1;
    const user = await createUser({ email: `remedy-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand });
    const order = await createOrder(user, [toOrderItem(shirt, 2)]);
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 }
    ]);
    const intent = await paymentService.createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await paymentService.confirmPayment(
        intent.data.id,
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    await carryOrderTo(orderId, 'delivered');
    const outcome = await returnService.createReturn(
        { orderId, reason, ...(preferredRemedy ? { preferredRemedy } : {}) },
        asCustomer(user.id),
        callerContextAs('customer', user.id)
    );
    if (!outcome.success) throw new Error('expected a return');
    const id = String(outcome.data._id);
    if (reason !== 'withdrawal') await returnService.approveReturn(id, admin);
    await settleOutboxNudges();
    return { user, shirt, orderId, id };
};

type Opened = Awaited<ReturnType<typeof approvedReturn>>;

/** A broken pair is not sellable: restock 0. */
const broken = (opened: Opened) => ({
    lines: [{ productId: String(opened.shirt._id), restock: 0 }]
});

/** The order's status, as stored. */
const statusOf = (orderId: string) => readOrder(orderId).then((order) => order?.status);

/** The return's status, as stored. */
const statusOfReturn = (id: string) => returnRepository.findById(id).then((found) => found?.status);

/** What the payment has refunded so far. */
const refundedOf = async (orderId: string) => {
    const result = await paymentService.getForOrder(orderId, asAdmin());
    if (!result.success) throw new Error('no payment');
    return result.data.amountRefunded;
};

describe('asking for a remedy', () => {
    it('keeps what the buyer asked for on a defect, as a wish', async () => {
        const { id } = await approvedReturn('defective', 10, 'repair');

        const stored = await returnRepository.findById(id);

        expect(stored?.preferredRemedy).toBe('repair');
        expect(stored?.remedy).toBeUndefined();
    });

    it('refuses a preferred remedy on a withdrawal, which is always a refund', async () => {
        customers += 1;
        const user = await createUser({ email: `remedy-w-${customers}@example.com` });
        const shirt = await createProduct({ price: 30, onHand: 5 });
        const order = await createOrder(user, [toOrderItem(shirt, 1)]);
        await carryOrderTo(String(order._id), 'delivered');

        const outcome = await returnService.createReturn(
            { orderId: String(order._id), reason: 'withdrawal', preferredRemedy: 'replace' },
            asCustomer(user.id),
            callerContextAs('customer', user.id)
        );

        expect(asReject(outcome).errors).toMatchObject([
            { code: 'RETURN_REMEDY_INVALID', details: { field: 'preferredRemedy' } }
        ]);
    });
});

describe('receiving with a replacement', () => {
    it('reopens the units on the same order, closes at 0 and moves no money', async () => {
        const opened = await approvedReturn();
        const before = await readOrder(opened.orderId);

        const result = await returnService.receiveReturn(
            opened.id,
            { remedy: 'replace', ...broken(opened) },
            admin
        );

        expect(result.success && result.data).toMatchObject({
            status: 'closed',
            remedy: 'replace',
            refundAmount: 0
        });
        expect(await refundedOf(opened.orderId)).toBe(0);
        const after = await readOrder(opened.orderId);
        expect(after?.status).toBe(OrderStatus.processing);
        // The same fulfillment order is open again, and nothing new was made for it.
        const [origin, ...others] = await fulfillmentOrdersOf(opened.orderId);
        expect(others).toHaveLength(0);
        expect(origin.lines[0]).toMatchObject({ quantity: 2, shippedQuantity: 0 });
        // The shelf set the two replacements aside.
        expect(await countersOf(opened.shirt._id)).toMatchObject({ onHand: 8, reserved: 2 });
        expect(after?.withdrawUntil).toEqual(before?.withdrawUntil);
    });

    it('ships through the ordinary door, and the arrival keeps the withdrawal clock', async () => {
        const opened = await approvedReturn();
        const before = await readOrder(opened.orderId);
        await returnService.receiveReturn(
            opened.id,
            { remedy: 'replace', ...broken(opened) },
            admin
        );

        const [origin] = await fulfillmentOrdersOf(opened.orderId);
        const shipped = await deliveryService.shipFulfillmentOrder(
            String(origin._id),
            { trackingCode: 'TRK-REPLACE01' },
            asAdmin(),
            admin
        );
        expect(shipped.success).toBe(true);
        expect(await statusOf(opened.orderId)).toBe(OrderStatus.shipped);
        await deliverEverything(opened.orderId);

        const after = await readOrder(opened.orderId);
        expect(after?.status).toBe(OrderStatus.delivered);
        // The withdrawal clock does not restart; the guarantee only ever moves out.
        expect(after?.withdrawUntil).toEqual(before?.withdrawUntil);
        expect(after!.conformityUntil!.getTime()).toBeGreaterThanOrEqual(
            before!.conformityUntil!.getTime()
        );
        // Two sold, none restocked, the two replacements shipped: six left.
        expect(await countersOf(opened.shirt._id)).toMatchObject({ onHand: 6, reserved: 0 });
    });

    it('leaves the replaced units returnable under the guarantee, and never takes the delivery refund', async () => {
        const opened = await approvedReturn();
        await returnService.receiveReturn(
            opened.id,
            { remedy: 'replace', ...broken(opened) },
            admin
        );
        const [origin] = await fulfillmentOrdersOf(opened.orderId);
        await deliveryService.shipFulfillmentOrder(String(origin._id), {}, asAdmin(), admin);
        await deliverEverything(opened.orderId);

        const again = await returnService.createReturn(
            { orderId: opened.orderId, reason: 'defective' },
            asCustomer(opened.user.id),
            callerContextAs('customer', opened.user.id)
        );

        expect(again.success && again.data.lines[0]).toMatchObject({ quantity: 2 });
    });

    it('owes what the shelf cannot cover on a fulfillment order on hold', async () => {
        const opened = await approvedReturn('defective', 2);

        await returnService.receiveReturn(
            opened.id,
            { remedy: 'replace', ...broken(opened) },
            admin
        );

        const all = await fulfillmentOrdersOf(opened.orderId);
        expect(all).toHaveLength(2);
        const owed = all.find(({ cause }) => cause === 'backorder');
        expect(owed).toMatchObject({ status: 'on_hold', lines: [{ quantity: 2 }] });
        // The origin gave those two units to the owed order, so it holds none open.
        expect(all.find(({ cause }) => cause !== 'backorder')?.lines).toHaveLength(0);
    });

    it('answers 409 when the order never shipped that many units, and writes nothing', async () => {
        const opened = await approvedReturn();
        const [origin] = await fulfillmentOrdersOf(opened.orderId);
        // Pretend one unit was never shipped: the fulfillment order says only one left.
        await setFirstLineShipped(String(origin._id), 1);

        const result = await returnService.receiveReturn(
            opened.id,
            { remedy: 'replace', ...broken(opened) },
            admin
        );

        expect(asReject(result).errors).toMatchObject([{ code: 'DELIVERY_NOT_REOPENABLE' }]);
        expect(await statusOfReturn(opened.id)).toBe('approved');
        expect(await countersOf(opened.shirt._id)).toMatchObject({ onHand: 8 });
    });
});

describe('receiving with a repair', () => {
    it('closes at 0, moves no money and extends the guarantee by 12 months', async () => {
        const opened = await approvedReturn();
        const before = (await readOrder(opened.orderId))!.conformityUntil!;

        const result = await returnService.receiveReturn(opened.id, { remedy: 'repair' }, admin);

        expect(result.success && result.data).toMatchObject({
            status: 'closed',
            remedy: 'repair',
            refundAmount: 0
        });
        expect(await refundedOf(opened.orderId)).toBe(0);
        const after = await readOrder(opened.orderId);
        expect(after!.conformityUntil!.getUTCFullYear()).toBe(before.getUTCFullYear() + 1);
        expect(after!.conformityUntil!.getUTCMonth()).toBe(before.getUTCMonth());
        // A repair ships nothing and the order stays delivered.
        expect(after?.status).toBe(OrderStatus.delivered);
    });

    it('extends only once per order, however many repairs follow', async () => {
        const opened = await approvedReturn();
        await returnService.receiveReturn(opened.id, { remedy: 'repair' }, admin);
        const once = (await readOrder(opened.orderId))!.conformityUntil!;
        const second = await returnService.createReturn(
            { orderId: opened.orderId, reason: 'defective' },
            asCustomer(opened.user.id),
            callerContextAs('customer', opened.user.id)
        );
        if (!second.success) throw new Error('expected a second return');
        await returnService.approveReturn(String(second.data._id), admin);

        await returnService.receiveReturn(String(second.data._id), { remedy: 'repair' }, admin);

        expect((await readOrder(opened.orderId))!.conformityUntil).toEqual(once);
    });

    it('leaves the repaired units returnable and out of the order accounting', async () => {
        const opened = await approvedReturn();
        await returnService.receiveReturn(opened.id, { remedy: 'repair' }, admin);

        const order = await readOrder(opened.orderId);

        expect(order?.returnStatus).toBeUndefined();
        const timeline = await timelineOf(opened.orderId, 'return_closed');
        expect(timeline[0]?.data).toMatchObject({ remedy: 'repair', refundAmount: 0 });
    });
});

describe('what the ladder refuses', () => {
    it('answers 422 for a replacement on a withdrawal: that is always a refund', async () => {
        const opened = await approvedReturn('withdrawal');

        const result = await returnService.receiveReturn(opened.id, { remedy: 'replace' }, admin);

        expect(asReject(result).errors).toMatchObject([
            { code: 'RETURN_REMEDY_INVALID', details: { field: 'remedy' } }
        ]);
        expect(await statusOfReturn(opened.id)).toBe('approved');
    });

    it('answers 422 for a handling deduction on a defect, whatever the remedy', async () => {
        const opened = await approvedReturn();

        const result = await returnService.receiveReturn(
            opened.id,
            { handlingDeduction: 5 },
            admin
        );

        expect(asReject(result).errors).toMatchObject([
            { code: 'RETURN_DEDUCTION_INVALID', details: { field: 'handlingDeduction' } }
        ]);
    });

    it('still refunds by default, and records that the remedy was a refund', async () => {
        const opened = await approvedReturn();

        const result = await returnService.receiveReturn(opened.id, {}, admin);

        expect(result.success).toBe(true);
        const stored = await returnRepository.findById(opened.id);
        expect([stored?.status, stored?.remedy, stored?.refundAmount]).toEqual([
            'closed',
            'refund',
            60
        ]);
    });
});
