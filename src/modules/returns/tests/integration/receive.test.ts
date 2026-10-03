/**
 * @module
 * Receiving goods against a real database and the real `fake` payment provider: the status move
 * and the restock are one transaction, the refund is opened on the payment before the provider is
 * asked and carries the return's id, and a return the provider refused is closed later by the
 * refund that finally lands — not left stuck.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct, countersOf } from '@modules/products/tests/factories';
import {
    createOrder,
    forceOrderStatus,
    readOrder,
    toOrderItem
} from '@modules/orders/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { OrderStatus } from '@types';
import { inventoryService } from '@modules/inventory';
import { createIntent, confirmPayment, paymentService } from '@modules/payments';
import paymentsModule from '@modules/payments/module';
import invoicingModule from '@modules/invoicing/module';
import returnsModule from '../../module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, asCustomer, testCallerContext, callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';
import { approveReturn, createReturn, receiveReturn } from '../../services';
import { RETURN_CLOSED, RETURN_RECEIVED } from '../../events';
import { returnRepository } from '../../repository';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule, invoicingModule, returnsModule]);
    mockEnqueueEmail.mockClear();
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** Waits for a fire-and-forget listener's write — the refund's `PAYMENT_REFUNDED` closes a return. */
const waitFor = async (check: () => Promise<boolean>): Promise<void> => {
    const startedAt = Date.now();
    while (!(await check())) {
        if (Date.now() - startedAt > 3000) throw new Error('waitFor: timed out');
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

/** A distinct address per customer. */
let customers = 0;

/**
 * A customer who bought two shirts (30.00 each) and a mug (10.00) with `shipping` on top, paid for
 * it by card, and has since received it. Stock is held and sold for real, so a restock has
 * something to give back.
 */
const paidAndDelivered = async (shipping = 0, shippingMethod = 'standard') => {
    customers += 1;
    const user = await createUser({ email: `buyer-${customers}@example.com` });
    const shirt = await createProduct({ title: 'Shirt', price: 30, onHand: 10 });
    const mug = await createProduct({ title: 'Mug', price: 10, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(shirt, 2), toOrderItem(mug, 1)], {
        ...(shipping > 0 ? { shippingMethod, shippingCost: shipping } : {})
    });
    const orderId = String(order._id);
    await inventoryService.reserveForOrder(orderId, [
        { productId: String(shirt._id), quantity: 2 },
        { productId: String(mug._id), quantity: 1 }
    ]);
    const intent = await createIntent(orderId, asCustomer(user.id));
    if (!intent.success) throw new Error('intent refused');
    await confirmPayment(intent.data.id, 'pm_card_visa', asCustomer(user.id), testCallerContext);
    await forceOrderStatus(orderId, OrderStatus.delivered);
    return { user, shirt, mug, orderId };
};

/** Open a return on `lines` (or everything) and approve it — ready to receive. */
const approvedReturn = async (
    fixture: Awaited<ReturnType<typeof paidAndDelivered>>,
    reason: 'withdrawal' | 'defective' = 'withdrawal',
    lines?: { productId: string; quantity: number }[]
) => {
    const outcome = await createReturn(
        { orderId: fixture.orderId, reason, ...(lines ? { lines } : {}) },
        asCustomer(fixture.user.id),
        testCallerContext
    );
    if (outcome.kind !== 'created') throw new Error('expected a return');
    const id = String(outcome.created._id);
    if (reason !== 'withdrawal') {
        await approveReturn(id, callerContextAs('admin'));
    }
    return id;
};

/** The payment behind an order, as the wire serves it, or a loud failure. */
const paymentOf = async (orderId: string) => {
    const result = await paymentService.getForOrder(orderId, asAdmin());
    if (!result.success) throw new Error('no payment');
    return result.data;
};

/** The order as the wire serves it — the projections resolved, or a loud failure. */
const wireOrder = (orderId: string) =>
    readOrder(orderId).then((order) => {
        if (!order) throw new Error('no order');
        return order.toJSON();
    });

describe('the statuses the order shows beside its own', () => {
    it('follows the return from requested through approved to returned', async () => {
        const fixture = await paidAndDelivered();
        const before = await wireOrder(fixture.orderId);
        expect(before.returnStatus).toBe('none');
        expect(before.paymentStatus).toBe('paid');
        expect(before.fulfillmentStatus).toBe('fulfilled');

        const id = await approvedReturn(fixture, 'defective');
        const approved = await wireOrder(fixture.orderId);
        expect(approved.returnStatus).toBe('in_progress');

        await receiveReturn(id, {}, callerContextAs('admin'));
        const after = await wireOrder(fixture.orderId);
        expect(after.returnStatus).toBe('returned');
        expect(after.paymentStatus).toBe('refunded');
    });

    it('reads partially returned and partially refunded after taking back one line', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture, 'withdrawal', [
            { productId: String(fixture.mug._id), quantity: 1 }
        ]);

        await receiveReturn(id, {}, callerContextAs('admin'));

        await waitFor(() =>
            wireOrder(fixture.orderId).then(
                ({ paymentStatus }) => paymentStatus === 'partially_refunded'
            )
        );
        const after = await wireOrder(fixture.orderId);
        expect(after.returnStatus).toBe('partially_returned');
    });
});

describe('receiving a return', () => {
    it('puts the goods back on sale, refunds them, and closes the return', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture);
        expect(await countersOf(fixture.shirt._id)).toMatchObject({ onHand: 8 });
        const events: string[] = [];
        onDomainEvent(RETURN_RECEIVED, () => events.push('received'));
        onDomainEvent(RETURN_CLOSED, () => events.push('closed'));

        const result = await receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data).toMatchObject({
            status: 'closed',
            refundAmount: 70
        });
        expect(await countersOf(fixture.shirt._id)).toMatchObject({ onHand: 10 });
        expect(await countersOf(fixture.mug._id)).toMatchObject({ onHand: 10 });
        const payment = await paymentOf(fixture.orderId);
        expect(payment.status).toBe('refunded');
        expect(payment.refunds[0]).toMatchObject({
            amount: 70,
            reason: 'return',
            status: 'succeeded',
            returnId: id
        });
        await waitFor(() => Promise.resolve(events.length === 2));
        expect(events.toSorted()).toEqual(['closed', 'received']);
    });

    it('records one restock movement per line, naming the return', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture);

        await receiveReturn(id, {}, callerContextAs('admin'));

        const movements = await inventoryService.listMovements({
            productId: String(fixture.shirt._id)
        });
        const restocks = movements.items.filter((row) => row.reason === 'restock');
        expect(restocks).toHaveLength(1);
        expect(restocks[0]).toMatchObject({
            reference: fixture.orderId,
            note: `return ${id}`,
            onHandDelta: 2
        });
    });

    it('takes back only the returned lines and leaves the payment succeeded, with the rest refundable', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture, 'withdrawal', [
            { productId: String(fixture.mug._id), quantity: 1 }
        ]);

        const result = await receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.refundAmount).toBe(10);
        const payment = await paymentOf(fixture.orderId);
        expect(payment.status).toBe('succeeded');
        expect(payment.amountRefunded).toBe(10);
        expect(await countersOf(fixture.shirt._id)).toMatchObject({ onHand: 8 });
        expect(await countersOf(fixture.mug._id)).toMatchObject({ onHand: 10 });
    });

    it('is done once — a second receipt answers 409 and restocks nothing more', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture);
        await receiveReturn(id, {}, callerContextAs('admin'));

        const again = await receiveReturn(id, {}, callerContextAs('admin'));

        expect(asReject(again).status).toBe(409);
        expect(asReject(again).errors[0].code).toBe('RETURN_NOT_RECEIVABLE');
        expect(await countersOf(fixture.shirt._id)).toMatchObject({ onHand: 10 });
    });

    it('lets exactly one of two racing receipts win', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture);

        const results = await Promise.all([
            receiveReturn(id, {}, callerContextAs('admin')),
            receiveReturn(id, {}, callerContextAs('admin'))
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
        expect(await countersOf(fixture.shirt._id)).toMatchObject({ onHand: 10 });
    });

    it('refuses a return still waiting for staff', async () => {
        const fixture = await paidAndDelivered();
        const outcome = await createReturn(
            { orderId: fixture.orderId, reason: 'defective' },
            asCustomer(fixture.user.id),
            testCallerContext
        );
        if (outcome.kind !== 'created') throw new Error('expected a return');

        const result = await receiveReturn(
            String(outcome.created._id),
            {},
            callerContextAs('admin')
        );

        expect(asReject(result).errors[0].code).toBe('RETURN_NOT_RECEIVABLE');
    });

    it('answers 404 for a return that does not exist', async () => {
        const result = await receiveReturn('a'.repeat(24), {}, callerContextAs('admin'));

        expect(asReject(result).status).toBe(404);
    });

    it('tells the customer their money went back', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture);
        mockEnqueueEmail.mockClear();

        await receiveReturn(id, {}, callerContextAs('admin'));

        const mail = mockEnqueueEmail.mock.calls.find(
            ([, template]) => template === 'returns.notice'
        );
        expect(JSON.stringify(mail?.[2])).toContain('70');
    });
});

describe('what the customer gets back', () => {
    it('adds the delivery paid on a full withdrawal, up to the cheapest standard delivery', async () => {
        // 70.00 of goods: standard would cost 5.00, so of the 15.00 express paid only 5.00 goes back.
        const fixture = await paidAndDelivered(15, 'express');
        const id = await approvedReturn(fixture);

        const result = await receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.refundAmount).toBe(75);
    });

    it('keeps a paid express upgrade entirely with the shop when standard would have been free', async () => {
        const user = await createUser({ email: 'big-spender@example.com' });
        const suit = await createProduct({ title: 'Suit', price: 150, onHand: 3 });
        const order = await createOrder(user, [toOrderItem(suit, 1)], {
            shippingMethod: 'express',
            shippingCost: 15
        });
        const orderId = String(order._id);
        const intent = await createIntent(orderId, asCustomer(user.id));
        if (!intent.success) throw new Error('intent refused');
        await confirmPayment(
            intent.data.id,
            'pm_card_visa',
            asCustomer(user.id),
            testCallerContext
        );
        await forceOrderStatus(orderId, OrderStatus.delivered);
        const outcome = await createReturn(
            { orderId, reason: 'withdrawal' },
            asCustomer(user.id),
            testCallerContext
        );
        if (outcome.kind !== 'created') throw new Error('expected a return');

        const result = await receiveReturn(
            String(outcome.created._id),
            {},
            callerContextAs('admin')
        );

        expect(result.success && result.data.refundAmount).toBe(150);
    });

    it('refunds the whole delivery when the goods were faulty', async () => {
        const fixture = await paidAndDelivered(15, 'express');
        const id = await approvedReturn(fixture, 'defective');

        const result = await receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.refundAmount).toBe(85);
    });

    it('refunds no delivery on a partial return', async () => {
        const fixture = await paidAndDelivered(15, 'express');
        const id = await approvedReturn(fixture, 'defective', [
            { productId: String(fixture.shirt._id), quantity: 1 }
        ]);

        const result = await receiveReturn(id, {}, callerContextAs('admin'));

        expect(result.success && result.data.refundAmount).toBe(30);
    });

    it('keeps back a handling deduction, and says so', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture);

        const result = await receiveReturn(
            id,
            { handlingDeduction: 12.5 },
            callerContextAs('admin')
        );

        expect(result.success && result.data).toMatchObject({
            handlingDeduction: 12.5,
            refundAmount: 57.5
        });
    });

    it('refuses a deduction bigger than the refund is worth, before anything moves', async () => {
        const fixture = await paidAndDelivered();
        const id = await approvedReturn(fixture);

        const result = await receiveReturn(
            id,
            { handlingDeduction: 70.01 },
            callerContextAs('admin')
        );

        expect(asReject(result).status).toBe(422);
        expect(asReject(result).errors[0].code).toBe('RETURN_DEDUCTION_INVALID');
        const stored = await returnRepository.findById(id);
        expect(stored?.status).toBe('approved');
        expect(await countersOf(fixture.shirt._id)).toMatchObject({ onHand: 8 });
    });

    it('never refunds more than the payment has left, whatever was refunded on goodwill before', async () => {
        const fixture = await paidAndDelivered();
        await paymentService.refundByOrder(fixture.orderId, asAdmin(), callerContextAs('admin'), {
            amount: 40
        });
        const id = await approvedReturn(fixture);

        const result = await receiveReturn(id, {}, callerContextAs('admin'));

        const payment = await paymentOf(fixture.orderId);
        // 70.00 was paid, 40.00 already went back: the return is owed 70.00 but only 30.00 is left.
        expect(payment.amountRefunded).toBe(70);
        expect(payment.status).toBe('refunded');
        expect(payment.refunds.map((refund) => refund.amount)).toEqual([40, 30]);
        expect(result.success && result.data.status).toBe('closed');
    });
});
