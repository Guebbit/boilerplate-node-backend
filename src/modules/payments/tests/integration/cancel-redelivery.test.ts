/**
 * @module
 * A redelivered `order.canceled` event never refunds twice. The outbox delivers an event again
 * until its listener resolves, and staff may have voided the refund the first delivery opened in
 * between: the payment must remember the event id, not infer "done" from the refund still being
 * there. Driven through the real listener (`emitDomainEvent` with the relay's `eventId`), real
 * Mongo, the fake provider.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { ORDER_CANCELED, orderService } from '@modules/orders';
import { paymentService } from '@modules/payments/services';
import { PAYMENT_REFUND_OWED_BY_HAND } from '@modules/payments/events';
import { CANCEL_EVENT_WRITE_RETRIES } from '@modules/payments/services/refunds';
import { paymentRepository } from '@modules/payments/repository';
import paymentsModule from '@modules/payments/module';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';
import {
    fakePaymentProvider,
    setFakeRefundFailure
} from '@scenarios/support/doubles/payments/fake';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { withEnvironmentOverrides } from '@tests/environment';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A 100.00 order (two units at 50.00) with an unpaid payment's worth of setup left to the test. */
const freshOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: '50.00' });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    return { user, order, orderId: String(order._id) };
};

/** A card order paid in full. */
const paidCardOrder = async () => {
    const { user, order, orderId } = await freshOrder();
    await payByCard(order, user);
    await settleOutboxNudges();
    return { user, orderId };
};

/** A cash order, paid by hand. */
const cashOrder = async () => {
    const { orderId } = await freshOrder();
    await paymentService.recordOfflinePayment(
        orderId,
        { method: 'cash' },
        callerContextAs('admin')
    );
    return orderId;
};

/** The stored payment behind an order. */
const paymentOf = async (orderId: string) => {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    return payment;
};

/**
 * One field of the stored payment.
 * @param orderId - the order
 * @param key - the payment field to read
 */
const field = <TKey extends 'amountRefunded' | 'refunds' | 'handledCancelEvents' | 'status'>(
    orderId: string,
    key: TKey
) => paymentOf(orderId).then((payment) => payment[key]);

/**
 * One delivery of the cancel event, as the relay makes it.
 * @param orderId - the canceled order
 * @param eventId - the outbox row id; the same one on every redelivery of one event
 */
const deliverCancel = (orderId: string, eventId: string) =>
    emitDomainEvent(ORDER_CANCELED, { orderId, refund: true, cause: 'operator' }, { eventId });

/** Staff void the payment's refund, as the admin does. */
const voidRefund = async (orderId: string, index = 0) => {
    const payment = await paymentOf(orderId);
    const result = await paymentService.cancelRefund(
        String(payment._id),
        String(payment.refunds[index]._id),
        'paid another way',
        asAdmin(),
        callerContextAs('admin')
    );
    expect(result.success).toBe(true);
};

describe('a redelivered cancel event after staff voided the refund', () => {
    it('does not pay a card again: no new record, the provider asked once', async () => {
        await withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidCardOrder();
            const payment = await paymentOf(orderId);
            setFakeRefundFailure(String(payment.providerRef), 'insufficient_funds');
            const send = jest.spyOn(fakePaymentProvider, 'refund');

            expect(await deliverCancel(orderId, 'evt-1')).toBe(true);
            await voidRefund(orderId);
            expect(await field(orderId, 'amountRefunded')).toBe('0.00');
            setFakeRefundFailure(String(payment.providerRef), undefined);
            const asked = send.mock.calls.length;

            expect(await deliverCancel(orderId, 'evt-1')).toBe(true);

            const after = await paymentOf(orderId);
            expect(after.refunds).toHaveLength(1);
            expect(after.amountRefunded).toBe('0.00');
            expect(send).toHaveBeenCalledTimes(asked);
        });
    });

    it('does not owe a hand-paid refund twice: one record, one owed row, one event', async () => {
        const orderId = await cashOrder();

        await deliverCancel(orderId, 'evt-1');
        await voidRefund(orderId);
        await deliverCancel(orderId, 'evt-1');

        const after = await paymentOf(orderId);
        expect(after.refunds).toHaveLength(1);
        expect(after.refunds[0]).toMatchObject({ status: 'failed', failureReason: 'canceled' });
        expect(after.amountRefunded).toBe('0.00');
        await settleOutboxNudges();
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUND_OWED_BY_HAND })).toBe(
            1
        );
    });

    it('still refunds for a different event id', async () => {
        const orderId = await cashOrder();
        await deliverCancel(orderId, 'evt-1');
        await voidRefund(orderId);

        await deliverCancel(orderId, 'evt-2');

        const after = await paymentOf(orderId);
        expect(after.refunds).toHaveLength(2);
        expect(after.amountRefunded).toBe('100.00');
        expect(after.handledCancelEvents).toEqual(['evt-1', 'evt-2']);
    });

    it('treats an emit without an event id as it always did: nothing is remembered', async () => {
        const orderId = await cashOrder();
        await emitDomainEvent(ORDER_CANCELED, { orderId, refund: true, cause: 'operator' });
        await voidRefund(orderId);

        await emitDomainEvent(ORDER_CANCELED, { orderId, refund: true, cause: 'operator' });

        const after = await paymentOf(orderId);
        expect(after.refunds).toHaveLength(2);
        expect(after.handledCancelEvents).toEqual([]);
    });
});

describe('a cancel event that found nothing to return', () => {
    it('marks itself, so a later void and a replay still pay nothing', async () => {
        await withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidCardOrder();
            const payment = await paymentOf(orderId);
            // Staff already asked for everything back; the provider refused it, so the record
            // holds the whole amount and the cancel event has nothing left to open.
            setFakeRefundFailure(String(payment.providerRef), 'insufficient_funds');
            await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'));
            expect(await field(orderId, 'amountRefunded')).toBe('100.00');
            expect(await deliverCancel(orderId, 'evt-1')).toBe(true);
            expect(await field(orderId, 'refunds')).toHaveLength(1);
            expect(await field(orderId, 'handledCancelEvents')).toEqual(['evt-1']);
            await voidRefund(orderId);
            setFakeRefundFailure(String(payment.providerRef), undefined);

            await deliverCancel(orderId, 'evt-1');

            const after = await paymentOf(orderId);
            expect(after.refunds).toHaveLength(1);
            expect(after.amountRefunded).toBe('0.00');
        });
    });

    it('marks itself on a payment that is not yet succeeded, so late money is not paid twice', async () => {
        await withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { user, orderId } = await freshOrder();
            await paymentService.createIntent(orderId, asCustomer(user.id));
            const opened = await paymentOf(orderId);
            const providerRef = String(opened.providerRef);
            await orderService.cancelOnRequestById(orderId, asCustomer(user.id));
            await settleOutboxNudges();
            expect(await field(orderId, 'status')).toBe('canceled');
            expect(await deliverCancel(orderId, 'evt-1')).toBe(true);
            expect(await field(orderId, 'handledCancelEvents')).toContain('evt-1');
            // Money lands on the canceled intent: the settlement returns it, the provider refuses.
            setFakeRefundFailure(providerRef, 'insufficient_funds');
            await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');
            await paymentService.applyWebhookSettlement(providerRef);
            expect(await field(orderId, 'refunds')).toHaveLength(1);
            await voidRefund(orderId);
            setFakeRefundFailure(providerRef, undefined);

            await deliverCancel(orderId, 'evt-1');

            const after = await paymentOf(orderId);
            expect(after.refunds).toHaveLength(1);
            expect(after.amountRefunded).toBe('0.00');
        });
    });
});

describe('a cancel event that fails or races itself', () => {
    it('marks nothing when the write throws, so the next delivery refunds', async () => {
        const orderId = await cashOrder();
        jest.spyOn(paymentRepository, 'addRefund').mockRejectedValueOnce(new Error('db down'));

        expect(await deliverCancel(orderId, 'evt-1')).toBe(false);
        expect(await field(orderId, 'handledCancelEvents')).toEqual([]);
        expect(await deliverCancel(orderId, 'evt-1')).toBe(true);

        const after = await paymentOf(orderId);
        expect(after.refunds).toHaveLength(1);
        expect(after.handledCancelEvents).toEqual(['evt-1']);
    });

    it('is stamped by the write that opens the refund, so a crash before the mark pays nothing twice', async () => {
        const orderId = await cashOrder();
        jest.spyOn(paymentRepository, 'markCancelEventHandled').mockRejectedValueOnce(
            new Error('process died')
        );

        expect(await deliverCancel(orderId, 'evt-1')).toBe(false);
        await voidRefund(orderId);
        expect(await deliverCancel(orderId, 'evt-1')).toBe(true);

        const after = await paymentOf(orderId);
        expect(after.refunds).toHaveLength(1);
        expect(after.amountRefunded).toBe('0.00');
    });

    it('throws and marks nothing when its write keeps missing, so the outbox redelivers', async () => {
        const orderId = await cashOrder();
        const send = jest.spyOn(fakePaymentProvider, 'refund');
        const write = jest.spyOn(paymentRepository, 'addRefund').mockResolvedValue(null);

        expect(await deliverCancel(orderId, 'evt-1')).toBe(false);

        // Bounded: one first try plus the retries, then it gives up loudly.
        expect(write).toHaveBeenCalledTimes(CANCEL_EVENT_WRITE_RETRIES + 1);
        const after = await paymentOf(orderId);
        expect(after.refunds).toHaveLength(0);
        expect(after.handledCancelEvents).toEqual([]);
        expect(send).not.toHaveBeenCalled();
        write.mockRestore();
        expect(await deliverCancel(orderId, 'evt-1')).toBe(true);
        expect(await field(orderId, 'refunds')).toHaveLength(1);
    });

    it('opens one record when two deliveries of one event run together, and neither hangs', async () => {
        const orderId = await cashOrder();

        const results = await Promise.all([
            deliverCancel(orderId, 'evt-1'),
            deliverCancel(orderId, 'evt-1')
        ]);

        expect(results).toEqual([true, true]);
        const after = await paymentOf(orderId);
        expect(after.refunds).toHaveLength(1);
        expect(after.handledCancelEvents).toEqual(['evt-1']);
    });

    it('never publishes the handled ids on the wire', async () => {
        const orderId = await cashOrder();
        await deliverCancel(orderId, 'evt-1');

        const staff = await paymentService.getForOrder(orderId, asAdmin());

        expect(JSON.stringify(staff)).not.toContain('handledCancelEvents');
    });
});
