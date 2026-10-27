/**
 * @module
 * A refund the provider reports failed: one that settled and then bounced re-opens as owed (once),
 * one still open is failed for good by the provider's own word, and neither is ever sent again.
 * Redeliveries and a success report that arrives after the failure change nothing. Real Mongo,
 * the fake provider's late-failure lever.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { orderService } from '@modules/orders';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import {
    PAYMENT_REFUNDED,
    PAYMENT_REFUND_FAILED,
    PAYMENT_REFUND_REVERSED
} from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import {
    fakePaymentProvider,
    refundRefOfRecord,
    setFakeLateRefundFailure,
    setFakeRefundOutcome
} from '@scenarios/support/doubles/payments/fake';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, callerContextAs } from '@tests/callers';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';
import { withEnvironmentOverrides } from '@tests/environment';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A card payment of 100.00 whose first refund of `amount` settled at once. */
const settledRefund = async (amount = 30) => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    await payByCard(order, user);
    await settleOutboxNudges();
    const orderId = String(order._id);
    await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount });
    await settleOutboxNudges();
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    const refundId = String(payment.refunds[0]._id);
    const refundRef = refundRefOfRecord(refundId);
    if (!refundRef) throw new Error('the provider made no refund');
    return { orderId, payment, refundId, refundRef, providerRef: String(payment.providerRef) };
};

/** Deliver the provider's webhook for one refund. */
const deliver = (providerRef: string, refundRef: string) =>
    paymentService.applyWebhookDelivery({ id: 'evt', providerRef, refundRef }, 'fake');

/** The order's stamped payment status. */
const stampOf = (orderId: string) =>
    orderService.getById(orderId).then((order) => order?.paymentStatus);

/** How many outbox rows of one event exist. */
const events = (name: string) => outboxEventModel.countDocuments({ name });

describe('a settled refund the provider takes back', () => {
    it('re-opens as owed: status, stamp, timeline, one event, attention', async () => {
        const { orderId, providerRef, refundRef } = await settledRefund();
        expect(await stampOf(orderId)).toBe('partially_refunded');

        setFakeLateRefundFailure(refundRef, 'lost_or_stolen_card');
        await deliver(providerRef, refundRef);

        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment?.refunds[0]).toMatchObject({
            status: 'failed',
            failureReason: 'lost_or_stolen_card'
        });
        expect(payment?.refunds[0].reversedAt).toBeInstanceOf(Date);
        expect(payment?.refunds[0].settledAt).toBeUndefined();
        // Nothing else succeeded: the order reads paid again.
        expect(await stampOf(orderId)).toBeUndefined();
        await settleOutboxNudges();
        expect(await events(PAYMENT_REFUND_REVERSED)).toBe(1);
        const view = await paymentService.getForOrder(orderId, asAdmin());
        expect(view.data?.displayStatus).toBe('refund_pending');
        const attention = await paymentService.listAttention();
        expect(attention.items).toEqual([
            expect.objectContaining({
                kind: 'reversed_refund',
                since: payment?.refunds[0].reversedAt?.toISOString()
            })
        ]);
    });

    it('keeps the stamp partial while another refund still stands', async () => {
        const { orderId, providerRef, refundRef } = await settledRefund(30);
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 20 });

        setFakeLateRefundFailure(refundRef);
        await deliver(providerRef, refundRef);

        expect(await stampOf(orderId)).toBe('partially_refunded');
    });

    it('changes nothing on a redelivery, nor on a success report after the failure', async () => {
        const { orderId, providerRef, refundRef } = await settledRefund();
        setFakeLateRefundFailure(refundRef);
        await deliver(providerRef, refundRef);
        await deliver(providerRef, refundRef);
        setFakeRefundOutcome(refundRef, { status: 'succeeded' });
        await deliver(providerRef, refundRef);

        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment?.refunds[0].status).toBe('failed');
        await settleOutboxNudges();
        expect(await events(PAYMENT_REFUND_REVERSED)).toBe(1);
        expect(await events(PAYMENT_REFUNDED)).toBe(1);
    });

    it('is never sent again by the sweep', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { providerRef, refundRef } = await settledRefund();
            setFakeLateRefundFailure(refundRef);
            await deliver(providerRef, refundRef);
            const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();
            const read = jest.spyOn(fakePaymentProvider, 'retrieveRefund').mockClear();

            await paymentService.retryOpenRefunds();

            expect(send).not.toHaveBeenCalled();
            expect(read).not.toHaveBeenCalled();
        }));

    it('is closed by a hand settle, which announces it again; a late redelivery is a no-op', async () => {
        const { orderId, payment, refundId, providerRef, refundRef } = await settledRefund();
        setFakeLateRefundFailure(refundRef);
        await deliver(providerRef, refundRef);
        const offered = await paymentService.getForOrder(orderId, asAdmin());
        expect(offered.data?.actions?.settleByHand).toEqual([refundId]);
        expect(offered.data?.actions?.cancelRefund).toEqual([]);

        const settled = await paymentService.settleRefundByHand(
            String(payment._id),
            refundId,
            asAdmin(),
            callerContextAs('admin')
        );
        await deliver(providerRef, refundRef);

        expect(settled.success).toBe(true);
        const after = await paymentRepository.findByOrderId(orderId);
        expect(after?.refunds[0]).toMatchObject({ status: 'succeeded', settledByHand: true });
        expect(after?.refunds[0].reversedAt).toBeInstanceOf(Date);
        await settleOutboxNudges();
        expect(await events(PAYMENT_REFUNDED)).toBe(2);
        expect(await events(PAYMENT_REFUND_REVERSED)).toBe(1);
    });
});

describe('a webhook that beats refund()', () => {
    it('fails the open record for good: the late success answer settles nothing', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 50 });
        const order = await createOrder(user, [toOrderItem(product, 2)]);
        await payByCard(order, user);
        await settleOutboxNudges();
        const orderId = String(order._id);
        const before = await paymentRepository.findByOrderId(orderId);
        const providerRef = String(before?.providerRef);
        const send = fakePaymentProvider.refund.bind(fakePaymentProvider);
        jest.spyOn(fakePaymentProvider, 'refund').mockImplementation((...args) =>
            send(...args).then((made) => {
                setFakeLateRefundFailure(made.refundRef, 'declined');
                // The provider's report arrives before our own answer does.
                return deliver(providerRef, made.refundRef).then(() => made);
            })
        );

        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });

        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment?.refunds[0]).toMatchObject({ status: 'failed', failureReason: 'declined' });
        expect(payment?.refunds[0].reversedAt).toBeInstanceOf(Date);
        await settleOutboxNudges();
        expect(await events(PAYMENT_REFUNDED)).toBe(0);
        expect(await events(PAYMENT_REFUND_FAILED)).toBe(1);
        expect(await events(PAYMENT_REFUND_REVERSED)).toBe(0);
    });
});
