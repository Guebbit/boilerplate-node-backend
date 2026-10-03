/**
 * @module
 * Refund records: a refund is a row on the payment, opened before the provider is asked, so a
 * partial refund leaves the rest refundable, two racing refunds cannot return more than was paid,
 * and a refusal at the provider stays open for the sweep to finish with the SAME idempotency key.
 * Real Mongo throughout — the guarantees are the conditional writes.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { onDomainEvent, resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import {
    createIntent,
    confirmPayment,
    recordOfflinePayment,
    refundByOrder,
    retryOpenRefunds
} from '@modules/payments/services';
import { PAYMENT_REFUNDED } from '@modules/payments/events';
import { paymentRepository } from '@modules/payments/repository';
import { presentPayment } from '@modules/payments/presenter';
import { withEnvironment } from '@tests/environment';
import { fakePaymentProvider } from '@modules/payments/providers/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asReject } from '@tests/response';
import { asCustomer, asAdmin, testCallerContext, callerContextAs } from '@tests/callers';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A customer who paid 100.00 by card: one product at 50.00, two units. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const intent = await createIntent(String(order._id), asCustomer(user.id));
    await confirmPayment(
        String((intent as { data?: { id?: string } }).data?.id),
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    return { user, order, orderId: String(order._id) };
};

/** The payment behind an order — a failed lookup is the test's own error, not a null to handle. */
const paymentOf = async (orderId: string) => {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    return payment;
};

/** Refund `amount` of the order's payment as an operator. */
const refund = (orderId: string, body: { amount?: number; currency?: string } = {}) =>
    refundByOrder(orderId, asAdmin(), callerContextAs('admin'), body);

describe('a partial refund', () => {
    it('records the refund and keeps the payment succeeded, with the rest still refundable', async () => {
        const { orderId } = await paidOrder();

        const result = await refund(orderId, { amount: 30 });

        expect(result.success).toBe(true);
        const payment = await paymentOf(orderId);
        expect(payment.status).toBe('succeeded');
        expect(payment.amountRefunded).toBe(30);
        expect(payment.refunds).toHaveLength(1);
        expect(payment.refunds[0]).toMatchObject({
            amount: 30,
            currency: 'EUR',
            status: 'succeeded',
            reason: 'goodwill'
        });
        expect(payment.refunds[0].providerRefundRef).toMatch(/^re_fake_refund:/);
    });

    it('moves the payment to refunded once the parts add up to what was paid', async () => {
        const { orderId } = await paidOrder();

        await refund(orderId, { amount: 30 });
        await refund(orderId, { amount: 70 });

        const payment = await paymentOf(orderId);
        expect(payment.status).toBe('refunded');
        expect(payment.amountRefunded).toBe(100);
        expect(payment.refunds).toHaveLength(2);
    });

    it('refunds everything left when no amount is given', async () => {
        const { orderId } = await paidOrder();
        await refund(orderId, { amount: 30 });

        await refund(orderId);

        const payment = await paymentOf(orderId);
        expect(payment.status).toBe('refunded');
        expect(payment.refunds.map((entry) => entry.amount)).toEqual([30, 70]);
    });

    it('sums in minor units — three refunds of 0.10 and 0.20 never drift', async () => {
        const { orderId } = await paidOrder();

        await refund(orderId, { amount: 0.1 });
        await refund(orderId, { amount: 0.2 });

        const { amountRefunded: amountRefundedNow } = await paymentOf(orderId);
        expect(amountRefundedNow).toBe(0.3);
    });

    it('sends the provider only the part being returned, under a key of its own', async () => {
        const spy = jest.spyOn(fakePaymentProvider, 'refund');
        const { orderId } = await paidOrder();

        await refund(orderId, { amount: 30 });
        await refund(orderId, { amount: 20 });

        const [first, second] = spy.mock.calls;
        expect(first[1]).toEqual({ amount: 30, currency: 'EUR' });
        expect(second[1]).toEqual({ amount: 20, currency: 'EUR' });
        expect(first[2].idempotencyKey).not.toBe(second[2].idempotencyKey);
    });

    it('announces each refund once, saying whether it was the whole payment', async () => {
        const events: { amount: number; full: boolean; refundId: string }[] = [];
        onDomainEvent(PAYMENT_REFUNDED, (payload) => {
            events.push(payload);
        });
        const { orderId } = await paidOrder();

        await refund(orderId, { amount: 30 });
        await refund(orderId);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(events.map(({ amount, full }) => ({ amount, full }))).toEqual([
            { amount: 30, full: false },
            { amount: 70, full: false }
        ]);
        expect(new Set(events.map(({ refundId }) => refundId)).size).toBe(2);
    });

    it('marks a refund of the whole payment as full', async () => {
        const events: { full: boolean }[] = [];
        onDomainEvent(PAYMENT_REFUNDED, (payload) => {
            events.push(payload);
        });
        const { orderId } = await paidOrder();

        await refund(orderId);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(events).toEqual([expect.objectContaining({ full: true })]);
    });
});

describe('a refund that asks for too much', () => {
    it('is refused with 422 when it is more than is left', async () => {
        const { orderId } = await paidOrder();
        await refund(orderId, { amount: 60 });

        const result = await refund(orderId, { amount: 40.01 });

        expect(asReject(result).status).toBe(422);
        expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_EXCEEDS_REMAINING');
        const { refunds: refundsNow } = await paymentOf(orderId);
        expect(refundsNow).toHaveLength(1);
    });

    it('is refused with 409 once nothing is left', async () => {
        const { orderId } = await paidOrder();
        await refund(orderId);

        const result = await refund(orderId, { amount: 1 });

        expect(asReject(result).status).toBe(409);
    });

    it('cannot be beaten by two racing refunds — only one of them lands', async () => {
        const { orderId } = await paidOrder();

        const results = await Promise.all([
            refund(orderId, { amount: 60 }),
            refund(orderId, { amount: 60 })
        ]);

        expect(results.filter((result) => result.success)).toHaveLength(1);
        const payment = await paymentOf(orderId);
        expect(payment.amountRefunded).toBe(60);
        expect(payment.refunds).toHaveLength(1);
    });

    it('refuses an amount in another currency with 422', async () => {
        const { orderId } = await paidOrder();

        const result = await refund(orderId, { amount: 10, currency: 'JPY' });

        expect(asReject(result).status).toBe(422);
    });

    it('refuses an amount the currency has no minor unit for', async () => {
        const { orderId } = await paidOrder();

        const result = await refund(orderId, { amount: 10.001 });

        expect(asReject(result).status).toBe(422);
        const { refunds: refundsNow } = await paymentOf(orderId);
        expect(refundsNow).toHaveLength(0);
    });
});

describe('a refund the provider refuses', () => {
    it('stays on the record as failed, and the wire never carries the provider wording', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(
            new Error('provider secret detail')
        );

        await expect(refund(orderId, { amount: 30 })).rejects.toThrow('provider secret detail');

        const payment = await paymentOf(orderId);
        expect(payment.refunds[0]).toMatchObject({
            status: 'failed',
            lastError: 'provider secret detail'
        });
        // Still counted: the sweep will finish THIS refund, so nothing may be opened beside it.
        expect(payment.amountRefunded).toBe(30);
        const wire: Record<string, unknown> = { ...presentPayment(payment).refunds[0] };
        expect(wire).toMatchObject({ status: 'failed', amount: 30 });
        expect(wire).not.toHaveProperty('lastError');
        expect(wire).not.toHaveProperty('idempotencyKey');
        expect(wire).not.toHaveProperty('providerRefundRef');
        expect(wire).not.toHaveProperty('_id');
    });

    it('is finished by the sweep with the same idempotency key', () =>
        withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            const spy = jest.spyOn(fakePaymentProvider, 'refund');
            const { orderId } = await paidOrder();
            spy.mockRejectedValueOnce(new Error('unreachable'));
            await expect(refund(orderId, { amount: 30 })).rejects.toThrow('unreachable');

            expect(await retryOpenRefunds()).toBe(1);

            const payment = await paymentOf(orderId);
            expect(payment.refunds[0]).toMatchObject({ status: 'succeeded' });
            expect(payment.refunds[0].lastError).toBeUndefined();
            expect(spy.mock.calls[1][2].idempotencyKey).toBe(spy.mock.calls[0][2].idempotencyKey);
            // A second pass finds nothing open.
            expect(await retryOpenRefunds()).toBe(0);
        }));

    it('completes the payment when the sweep finishes the last part', () =>
        withEnvironment('NODE_PAYMENT_EFFECT_RETRY_MINUTES', '0', async () => {
            const { orderId } = await paidOrder();
            await refund(orderId, { amount: 40 });
            jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
            await expect(refund(orderId)).rejects.toThrow('down');
            const { status: statusNow } = await paymentOf(orderId);
            expect(statusNow).toBe('succeeded');

            await retryOpenRefunds();

            const { status: statusAfter } = await paymentOf(orderId);
            expect(statusAfter).toBe('refunded');
        }));

    it('is completed, not doubled, when the operator retries the same refund', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
        await expect(refund(orderId)).rejects.toThrow('down');

        const retried = await refund(orderId);

        expect(retried.success).toBe(true);
        const payment = await paymentOf(orderId);
        expect(payment.status).toBe('refunded');
        expect(payment.refunds).toHaveLength(1);
    });
});

describe('cancelling an order that was already partly refunded', () => {
    it('returns only what is left', async () => {
        const { user, orderId } = await paidOrder();
        await refund(orderId, { amount: 30 });

        const cancelled = await orderService.cancelById(orderId, asCustomer(user.id));
        expect(cancelled.success).toBe(true);
        await new Promise((resolve) => setTimeout(resolve, 20));

        const payment = await paymentOf(orderId);
        expect(payment.status).toBe('refunded');
        expect(payment.refunds.map((entry) => [entry.amount, entry.reason])).toEqual([
            [30, 'goodwill'],
            [70, 'cancellation']
        ]);
    });
});

describe('a partial refund on a payment recorded by hand', () => {
    it('is recorded as returned by hand, and finishes the payment when it adds up', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 50 });
        const order = await createOrder(user, [toOrderItem(product, 2)]);
        const orderId = String(order._id);
        await recordOfflinePayment(
            orderId,
            { method: 'cash', reference: 'till' },
            callerContextAs('admin')
        );
        const providerSpy = jest.spyOn(fakePaymentProvider, 'refund');

        await refund(orderId, { amount: 40 });
        const { status: statusNow } = await paymentOf(orderId);
        expect(statusNow).toBe('succeeded');
        await refund(orderId);

        const payment = await paymentOf(orderId);
        expect(payment.status).toBe('refunded');
        expect(payment.refundedByHand).toBe(true);
        expect(payment.refunds.every((entry) => entry.providerRefundRef === undefined)).toBe(true);
        expect(providerSpy).not.toHaveBeenCalled();
    });
});

describe('the payment.refunded announcement', () => {
    it('is an outbox row written with the settlement, once per refund', async () => {
        const { orderId } = await paidOrder();

        await refund(orderId, { amount: 30 });
        await settleOutboxNudges();

        const payment = await paymentOf(orderId);
        const rows = await outboxEventModel.find({ name: PAYMENT_REFUNDED }).lean();
        expect(rows).toHaveLength(1);
        expect(rows[0]).toMatchObject({
            aggregateId: orderId,
            status: 'published',
            payload: { orderId, refundId: String(payment.refunds[0]._id), amount: 30, full: false }
        });
    });

    it('commits or aborts with the settlement: no row, no settled refund', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(outboxEventModel, 'create').mockRejectedValueOnce(new Error('disk full'));

        await expect(refund(orderId)).rejects.toThrow('disk full');

        // The provider was asked, but the record never settled, so the payment is not `refunded`
        // and the sweep finishes the refund under the same idempotency key.
        const payment = await paymentOf(orderId);
        expect(payment.status).toBe('succeeded');
        expect(payment.refunds[0].status).not.toBe('succeeded');
        expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED })).toBe(0);
    });
});
