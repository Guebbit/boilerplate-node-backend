/**
 * @module
 * A refund's own status at the provider: one it accepts but has not settled stays open and
 * announces nothing, the sweep re-reads it instead of sending it again, and a webhook naming the
 * refund settles it. Real Mongo, the fake provider's `pending` lever.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_REFUNDED } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import {
    fakePaymentProvider,
    refundRefOfRecord,
    setFakeRefundOutcome,
    setFakeRefundPending
} from '@scenarios/support/doubles/payments/fake';
import { withEnvironmentOverrides } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, callerContextAs } from '@tests/callers';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A card payment of 100.00 whose first refund of 30.00 the provider accepts and holds `pending`. */
const pendingRefund = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    await payByCard(order, user);
    await settleOutboxNudges();
    const orderId = String(order._id);
    const before = await paymentRepository.findByOrderId(orderId);
    const providerRef = String(before?.providerRef);
    setFakeRefundPending(providerRef, true);
    const answer = await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
        amount: 30
    });
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    const refundId = String(payment.refunds[0]._id);
    const refundRef = refundRefOfRecord(refundId);
    if (!refundRef) throw new Error('the provider made no refund');
    return { orderId, providerRef, answer, payment, refundId, refundRef };
};

/** How many `payment.refunded` rows the outbox holds. */
const refundedEvents = () => outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED });

describe('a refund the provider accepts but has not settled', () => {
    it('answers 201 with the open record, and announces nothing', async () => {
        const { orderId, answer, refundRef } = await pendingRefund();

        expect(answer).toMatchObject({ success: true, status: 201 });
        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment?.refunds[0]).toMatchObject({
            status: 'pending',
            providerRefundRef: refundRef
        });
        expect(payment?.refunds[0].settledAt).toBeUndefined();
        await settleOutboxNudges();
        expect(await refundedEvents()).toBe(0);
    });

    it('is re-read by the sweep, never sent again, and settles once the provider says so', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, refundRef } = await pendingRefund();
            const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();
            const read = jest.spyOn(fakePaymentProvider, 'retrieveRefund').mockClear();

            // Still pending at the provider: nothing changes.
            expect(await paymentService.retryOpenRefunds()).toBe(0);
            expect(read).toHaveBeenCalledWith(refundRef);

            setFakeRefundOutcome(refundRef, { status: 'succeeded' });
            expect(await paymentService.retryOpenRefunds()).toBe(1);

            expect(send).not.toHaveBeenCalled();
            const payment = await paymentRepository.findByOrderId(orderId);
            expect(payment?.refunds[0]).toMatchObject({ status: 'succeeded' });
            await settleOutboxNudges();
            expect(await refundedEvents()).toBe(1);
        }));

    it('is settled by a webhook naming the refund, and a redelivery changes nothing', async () => {
        const { orderId, providerRef, refundRef } = await pendingRefund();
        setFakeRefundOutcome(refundRef, { status: 'succeeded' });

        await paymentService.applyWebhookDelivery({ id: 'evt_1', providerRef, refundRef }, 'fake');
        await paymentService.applyWebhookDelivery({ id: 'evt_1', providerRef, refundRef }, 'fake');

        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment?.refunds[0]).toMatchObject({ status: 'succeeded' });
        await settleOutboxNudges();
        expect(await refundedEvents()).toBe(1);
    });
});
