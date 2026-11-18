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
import { deliver } from '@modules/payments/tests/deliver';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_REFUNDED, PAYMENT_REFUND_UNRECORDED } from '@modules/payments/events';
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
/** Stands in for the mail queue; the cases assert which mail was enqueued. */
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
    const product = await createProduct({ price: '50.00', onHand: 10 });
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
const deliverRefund = (providerRef: string, refundRef: string) =>
    deliver({ id: 'evt', providerRef, refundRef });

/** How many `payment.refunded` rows the outbox holds. */
const refundedEvents = () => outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED });

/** The `payment.refund_unrecorded` rows the outbox holds, as their payloads. */
const unrecordedEvents = () =>
    outboxEventModel
        .find({ name: PAYMENT_REFUND_UNRECORDED })
        .lean()
        .then((rows) => rows.map((row) => row.payload));

/** 100.00 paid; our 50.00 refund refused for a transient reason; then 80.00 made in the dashboard. */
const overtaken = async () => {
    const { orderId, providerRef } = await paidOrder();
    setFakeRefundFailure(providerRef, 'provider_unavailable');
    await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: '50.00' });
    setFakeRefundFailure(providerRef, undefined);
    const refundRef = addFakeExternalRefund(providerRef, {
        amount: '80.00',
        currency: 'EUR',
        status: 'succeeded'
    });
    await deliverRefund(providerRef, refundRef);
    return { orderId };
};

describe('a refund made in the dashboard', () => {
    it('is imported once: a settled external record, the stamp, the event and the buyer mail', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'EUR',
            status: 'succeeded',
            createdAt: new Date('2026-03-01T10:00:00.000Z')
        });

        await deliverRefund(providerRef, refundRef);
        await deliverRefund(providerRef, refundRef);

        const payment = await paymentOf(orderId);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
            status: 'succeeded',
            reason: 'external',
            amount: '30.00',
            providerRefundRef: refundRef,
            idempotencyKey: `import:${refundRef}`
        });
        expect(payment.refunds[0].settledAt?.toISOString()).toBe('2026-03-01T10:00:00.000Z');
        expect(payment.amountRefunded).toBe('30.00');
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
            amount: '30.00',
            currency: 'EUR',
            status: 'succeeded'
        });
        addFakeExternalRefund(providerRef, {
            amount: '20.00',
            currency: 'EUR',
            status: 'succeeded'
        });

        await deliverRefund(providerRef, first);

        const payment = await paymentOf(orderId);
        expect(payment.refunds.map((refund) => refund.amount).toSorted()).toEqual([
            '20.00',
            '30.00'
        ]);
        expect(payment.amountRefunded).toBe('50.00');
        const view = await paymentService.getForOrder(orderId, asAdmin());
        expect(view.data?.displayStatus).toBe('partially_refunded');
    });

    it('skips a pending one, then imports it once it has succeeded', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'EUR',
            status: 'pending'
        });

        await deliverRefund(providerRef, refundRef);
        expect(await refundsOf(orderId)).toHaveLength(0);

        const { setFakeRefundOutcome } = await import('@scenarios/support/doubles/payments/fake');
        setFakeRefundOutcome(refundRef, { status: 'succeeded' });
        await deliverRefund(providerRef, refundRef);
        expect(await refundsOf(orderId)).toHaveLength(1);
    });

    it('skips a failed one, and says nothing: a refund that did not happen needs no one', async () => {
        const { orderId, providerRef } = await paidOrder();
        const failed = addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'EUR',
            status: 'failed'
        });

        await deliverRefund(providerRef, failed);

        expect(await refundsOf(orderId)).toHaveLength(0);
        expect(await unrecordedEvents()).toEqual([]);
    });

    it('does not convert one in another currency: it records nothing and tells staff', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'USD',
            status: 'succeeded'
        });

        await deliverRefund(providerRef, refundRef);

        expect(await refundsOf(orderId)).toHaveLength(0);
        const { _id: paymentId } = await paymentOf(orderId);
        expect(await unrecordedEvents()).toEqual([
            {
                paymentId: String(paymentId),
                orderId,
                refundRef,
                amount: '30.00',
                currency: 'USD',
                reason: 'other_currency'
            }
        ]);
    });

    it('gives up when every attempt loses its race, and tells staff once', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'EUR',
            status: 'succeeded'
        });
        const lost = jest.spyOn(paymentRepository, 'importRefund').mockResolvedValue(null);

        await deliverRefund(providerRef, refundRef);

        // The first attempt and three re-reads.
        expect(lost).toHaveBeenCalledTimes(4);
        expect(await refundsOf(orderId)).toHaveLength(0);
        expect(await unrecordedEvents()).toMatchObject([
            { orderId, refundRef, amount: '30.00', currency: 'EUR', reason: 'lost_race' }
        ]);
    });

    it('does not tell staff when a later attempt wins the race', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'EUR',
            status: 'succeeded'
        });
        jest.spyOn(paymentRepository, 'importRefund').mockResolvedValueOnce(null);

        await deliverRefund(providerRef, refundRef);

        expect(await refundsOf(orderId)).toHaveLength(1);
        expect(await unrecordedEvents()).toEqual([]);
    });

    it('re-sync imports a recordable refund once, and announces an unrecordable one on each run', async () => {
        const { orderId, providerRef } = await paidOrder();
        addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'EUR',
            status: 'succeeded'
        });
        addFakeExternalRefund(providerRef, {
            amount: '10.00',
            currency: 'USD',
            status: 'succeeded'
        });
        const { _id } = await paymentOf(orderId);

        await paymentService.syncRefunds(String(_id), asAdmin());
        await paymentService.syncRefunds(String(_id), asAdmin());

        expect(await refundsOf(orderId)).toHaveLength(1);
        // The books still lack the USD refund, so staff are reminded each time.
        expect(await unrecordedEvents()).toHaveLength(2);
    });

    it('is imported by the staff re-sync once the race is no longer lost', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: '30.00',
            currency: 'EUR',
            status: 'succeeded'
        });
        jest.spyOn(paymentRepository, 'importRefund').mockResolvedValue(null);
        await deliverRefund(providerRef, refundRef);
        jest.restoreAllMocks();
        const { _id } = await paymentOf(orderId);

        await paymentService.syncRefunds(String(_id), asAdmin());
        await paymentService.syncRefunds(String(_id), asAdmin());

        expect(await refundsOf(orderId)).toHaveLength(1);
        expect(await refundedOf(orderId)).toBe('30.00');
    });

    it('records one that is bigger than what was paid: the money moved', async () => {
        const { orderId, providerRef } = await paidOrder();
        const refundRef = addFakeExternalRefund(providerRef, {
            amount: '130.00',
            currency: 'EUR',
            status: 'succeeded'
        });

        await deliverRefund(providerRef, refundRef);

        const payment = await paymentOf(orderId);
        expect(payment.amountRefunded).toBe('130.00');
        expect(await stampOf(orderId)).toBe('refunded');
    });
});

describe('a refund that is ours', () => {
    it('is matched by the record id the provider echoes, never imported', async () => {
        const { orderId, providerRef } = await paidOrder();
        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: '30.00' });
        const payment = await paymentOf(orderId);
        const refundRef = refundRefOfRecord(String(payment.refunds[0]._id)) ?? '';

        await deliverRefund(providerRef, refundRef);

        expect(await refundsOf(orderId)).toHaveLength(1);
    });

    it('that timed out but ran is settled from the provider, not imported', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, providerRef } = await paidOrder();
            setFakeRefundTimeout(providerRef, true);
            await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), {
                amount: '30.00'
            });
            const failed = await paymentOf(orderId);
            expect(failed.refunds[0]).toMatchObject({
                status: 'failed',
                failureReason: 'provider_unavailable'
            });
            const refundRef = refundRefOfRecord(String(failed.refunds[0]._id)) ?? '';

            await deliverRefund(providerRef, refundRef);

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
                    amount: '50.00',
                    exceedsBy: '30.00'
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
            expect(await refundedOf(orderId)).toBe('80.00');
            await expect(paymentService.listAttention()).resolves.toEqual({ items: [] });
        }));
});
