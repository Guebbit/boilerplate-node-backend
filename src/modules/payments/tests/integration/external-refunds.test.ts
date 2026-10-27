/**
 * @module
 * Refunds made in the provider's own dashboard: found by a refund event, recorded once as settled
 * `external` refunds with the normal follow-ups, matched (never imported) when they are ours, and,
 * when they leave an open refund of ours no room, recorded anyway while that one is held unsent.
 * Real Mongo, the fake provider's dashboard lever.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { inventoryService } from '@modules/inventory';
import { orderService } from '@modules/orders';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_REFUNDED } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import {
    addFakeExternalRefund,
    fakePaymentProvider,
    refundRefOfRecord,
    setFakeRefundFailure,
    setFakeRefundTimeout
} from '@scenarios/support/doubles/payments/fake';
import { withEnvironmentOverrides } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, callerContextAs } from '@tests/callers';
import { eventually } from '@tests/eventually';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';

jest.mock('@infrastructure/adapters/mailer', () => ({
    __esModule: true,
    enqueueEmail: jest.fn()
}));
const mockEnqueueEmail = enqueueEmail as jest.MockedFunction<typeof enqueueEmail>;

setupTestDb();

beforeEach(() => {
    mockEnqueueEmail.mockClear();
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A customer who paid 100.00 by card. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    await inventoryService.reserveForOrder(String(order._id), [
        { productId: String(product._id), quantity: 2 }
    ]);
    await payByCard(order, user);
    await settleOutboxNudges();
    const orderId = String(order._id);
    const payment = await paymentRepository.findByOrderId(orderId);
    return { orderId, providerRef: String(payment?.providerRef) };
};

/** The payment behind an order. */
const paymentOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => {
        if (!payment) throw new Error('no payment');
        return payment;
    });

/** The records on an order's payment. */
const refundsOf = (orderId: string) => paymentOf(orderId).then((payment) => payment.refunds);

/** What the payment has given back so far, a decimal. */
const refundedOf = (orderId: string) =>
    paymentOf(orderId).then((payment) => payment.amountRefunded);

/** The order's stamped payment status. */
const stampOf = (orderId: string) =>
    orderService.getById(orderId).then((order) => order?.paymentStatus);

/** Deliver the provider's refund event. */
const deliver = (providerRef: string, refundRef: string) =>
    paymentService.applyWebhookDelivery({ id: 'evt', providerRef, refundRef }, 'fake');

/** How many `payment.refunded` rows the outbox holds. */
const refundedEvents = () => outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED });

/** 100.00 paid; our 50.00 refund refused for a transient reason; then 80.00 made in the dashboard. */
const overtaken = async () => {
    const { orderId, providerRef } = await paidOrder();
    setFakeRefundFailure(providerRef, 'provider_unavailable');
    await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 50 });
    setFakeRefundFailure(providerRef, undefined);
    const refundRef = addFakeExternalRefund(providerRef, {
        amount: 80,
        currency: 'EUR',
        status: 'succeeded'
    });
    await deliver(providerRef, refundRef);
    return { orderId };
};

describe('a refund made in the dashboard', () => {
    it('is imported once: a settled external record, the stamp, the event and the buyer mail', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: 30,
            currency: 'EUR',
            status: 'succeeded',
            createdAt: new Date('2026-03-01T10:00:00.000Z')
        });

        await deliver(providerRef, refundRef);
        await deliver(providerRef, refundRef);

        const payment = await paymentOf(orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
            status: 'succeeded',
            reason: 'external',
            amount: 30,
            providerRefundRef: refundRef,
            idempotencyKey: `import:${refundRef}`
        });
        expect(payment.refunds[0].settledAt?.toISOString()).toBe('2026-03-01T10:00:00.000Z');
        expect(payment.amountRefunded).toBe(30);
        expect(await stampOf(orderId)).toBe('partially_refunded');
        await eventually(() => settleOutboxNudges().then(() => true));
        expect(await refundedEvents()).toBe(1);
        await eventually(() =>
            settleOutboxNudges().then(
                () =>
                    mockEnqueueEmail.mock.calls.filter(
                        ([, name]) => name === 'payments.refund-issued'
                    ).length === 1
            )
        );
    });

    it('imports two partial dashboard refunds, and offers only what is left', async () => {
        const { orderId, providerRef } = await paidOrder();
        const first = addFakeExternalRefund(providerRef, {
            amount: 30,
            currency: 'EUR',
            status: 'succeeded'
        });
        addFakeExternalRefund(providerRef, { amount: 20, currency: 'EUR', status: 'succeeded' });

        await deliver(providerRef, first);

        const payment = await paymentOf(orderId);
        expect(payment.refunds.map((refund) => refund.amount).toSorted()).toEqual([20, 30]);
        expect(payment.amountRefunded).toBe(50);
        const view = await paymentService.getForOrder(orderId, asAdmin());
        expect(view.data?.displayStatus).toBe('partially_refunded');
    });

    it('skips a pending one, then imports it once it has succeeded', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: 30,
            currency: 'EUR',
            status: 'pending'
        });

        await deliver(providerRef, refundRef);
        expect(await refundsOf(orderId)).toHaveLength(0);

        const { setFakeRefundOutcome } = await import('@scenarios/support/doubles/payments/fake');
        setFakeRefundOutcome(refundRef, { status: 'succeeded' });
        await deliver(providerRef, refundRef);
        expect(await refundsOf(orderId)).toHaveLength(1);
    });

    it('skips a failed one and one in another currency', async () => {
        const { orderId, providerRef } = await paidOrder();
        const failed = addFakeExternalRefund(providerRef, {
            amount: 30,
            currency: 'EUR',
            status: 'failed'
        });
        addFakeExternalRefund(providerRef, { amount: 30, currency: 'USD', status: 'succeeded' });

        await deliver(providerRef, failed);

        expect(await refundsOf(orderId)).toHaveLength(0);
    });

    it('records one that is bigger than what was paid: the money moved', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: 130,
            currency: 'EUR',
            status: 'succeeded'
        });

        await deliver(providerRef, refundRef);

        const payment = await paymentOf(orderId);
        expect(payment.amountRefunded).toBe(130);
        expect(await stampOf(orderId)).toBe('refunded');
    });
});

describe('a refund that is ours', () => {
    it('is matched by the record id the provider echoes, never imported', async () => {
        const { orderId, providerRef } = await paidOrder();
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
        const payment = await paymentOf(orderId);
        const refundRef = refundRefOfRecord(String(payment.refunds[0]._id)) ?? '';

        await deliver(providerRef, refundRef);

        expect(await refundsOf(orderId)).toHaveLength(1);
    });

    it('that timed out but ran is settled from the provider, not imported', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, providerRef } = await paidOrder();
            setFakeRefundTimeout(providerRef, true);
            await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
            const failed = await paymentOf(orderId);
            expect(failed.refunds[0]).toMatchObject({
                status: 'failed',
                failureReason: 'provider_unavailable'
            });
            const refundRef = refundRefOfRecord(String(failed.refunds[0]._id)) ?? '';

            await deliver(providerRef, refundRef);

            const payment = await paymentOf(orderId);
            expect(payment.refunds).toHaveLength(1);
            expect(payment.refunds[0]).toMatchObject({ status: 'succeeded', reason: 'goodwill' });
        }));
});

describe('an open refund of ours an outside refund left no room for', () => {
    it('is held unsent, shown at once with the overshoot, and staff can cancel it', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await overtaken();
            const send = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

            await paymentService.retryOpenRefunds();

            expect(send).not.toHaveBeenCalled();
            const attention = await paymentService.listAttention();
            expect(attention.items).toEqual([
                expect.objectContaining({
                    kind: 'refund_exceeds_remaining',
                    orderId,
                    amount: 50,
                    exceedsBy: 30
                })
            ]);
            const payment = await paymentOf(orderId);
            const held = payment.refunds.find((refund) => refund.reason === 'goodwill');
            const view = await paymentService.getForOrder(orderId, asAdmin());
            expect(view.data?.actions?.cancelRefund).toEqual([String(held?._id)]);

            const canceled = await paymentService.cancelRefund(
                String(payment._id),
                String(held?._id),
                'refunded in the dashboard',
                asAdmin(),
                callerContextAs('admin')
            );
            expect(canceled.success).toBe(true);
            expect(await refundedOf(orderId)).toBe(80);
            await expect(paymentService.listAttention()).resolves.toEqual({ items: [] });
        }));
});
