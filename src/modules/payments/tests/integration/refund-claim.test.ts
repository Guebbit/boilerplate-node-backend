/**
 * @module
 * The claim before a refund is sent: one conditional write takes a record, a fence token stops a
 * slow old attempt from overwriting a newer one, a definite refusal is never sent again, a
 * retryable one waits out a growing delay, a removed provider ends a refund instead of jamming the
 * sweep, and a key the provider forgot cannot make a second refund. Real Mongo throughout.
 */

import { Types } from 'mongoose';
import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { paymentModel } from '@modules/payments/model';
import { withEnvironmentOverrides } from '@tests/environment';
import {
    ageFakeRefundKeys,
    fakePaymentProvider,
    fakeRefundsMade,
    setFakeRefundFailure,
    setFakeRefundTimeout
} from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
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

/** A customer who paid 100.00 by card. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    await payByCard(order, user);
    await settleOutboxNudges();
    return { orderId: String(order._id) };
};

/** The payment behind an order, or the test's own failure. */
const paymentOf = async (orderId: string) => {
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    return payment;
};

/** The order's first refund record. */
const firstRefund = (orderId: string) => paymentOf(orderId).then(({ refunds }) => refunds[0]);

/** Refund `amount` as an operator; a provider refusal rejects, the record stays open. */
const refund = (orderId: string, amount: number) =>
    refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount });

/** Rewrite one stored field of the payment's first refund, bypassing every timestamp. */
const setRefundField = (paymentId: unknown, field: string, value: unknown) =>
    paymentModel.collection.updateOne(
        { _id: paymentId as Types.ObjectId },
        { $set: { [`refunds.0.${field}`]: value, updatedAt: new Date(0) } }
    );

describe('a definite refusal', () => {
    it('is recorded as final and never sent again by the sweep', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidOrder();
            const payment = await paymentOf(orderId);
            setFakeRefundFailure(String(payment.providerRef), 'lost_or_stolen_card');
            await expect(refund(orderId, 30)).resolves.toMatchObject({
                success: true,
                status: 201
            });
            const spy = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

            await paymentService.retryOpenRefunds();

            const after = await paymentOf(orderId);
            expect(spy).not.toHaveBeenCalled();
            expect(after.refunds[0]).toMatchObject({
                status: 'failed',
                failureReason: 'lost_or_stolen_card'
            });
            expect(after.refunds[0].nextAttemptAt).toBeUndefined();
        }));
});

describe('a retryable refusal', () => {
    it('waits out its delay, then is sent again', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidOrder();
            jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
            await expect(refund(orderId, 30)).resolves.toMatchObject({
                success: true,
                status: 201
            });
            const waiting = await paymentOf(orderId);
            await setRefundField(waiting._id, 'nextAttemptAt', new Date(Date.now() + 3_600_000));
            const spy = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

            expect(await paymentService.retryOpenRefunds()).toBe(0);
            expect(spy).not.toHaveBeenCalled();

            await setRefundField(waiting._id, 'nextAttemptAt', new Date(Date.now() - 1000));
            expect(await paymentService.retryOpenRefunds()).toBe(1);
            await expect(firstRefund(orderId)).resolves.toMatchObject({ status: 'succeeded' });
        }));
});

describe('a pending record', () => {
    it('is resent once its attempt is stale and skipped while it is fresh', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '1' }, async () => {
            const { orderId } = await paidOrder();
            jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
            await expect(refund(orderId, 30)).resolves.toMatchObject({
                success: true,
                status: 201
            });
            const stored = await paymentOf(orderId);
            // Back to a live attempt that has only just started.
            await setRefundField(stored._id, 'status', 'pending');
            await setRefundField(stored._id, 'attemptedAt', new Date());
            await paymentModel.collection.updateOne(
                { _id: stored._id },
                { $set: { updatedAt: new Date(0) } }
            );
            const spy = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

            expect(await paymentService.retryOpenRefunds()).toBe(0);
            expect(spy).not.toHaveBeenCalled();

            await setRefundField(stored._id, 'attemptedAt', new Date(Date.now() - 600_000));
            expect(await paymentService.retryOpenRefunds()).toBe(1);
        }));

    it('lets only one of two claims through', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
        await expect(refund(orderId, 30)).resolves.toMatchObject({ success: true, status: 201 });
        const stored = await paymentOf(orderId);
        const refundId = String(stored.refunds[0]._id);
        const window = { now: new Date(), staleBefore: new Date(0) };
        await setRefundField(stored._id, 'nextAttemptAt', new Date(0));

        const [first, second] = await Promise.all([
            paymentRepository.claimRefund(String(stored._id), refundId, window),
            paymentRepository.claimRefund(String(stored._id), refundId, window)
        ]);

        expect([first, second].filter(Boolean)).toHaveLength(1);
    });

    it('cannot be failed by an attempt that a newer claim superseded', async () => {
        const { orderId } = await paidOrder();
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
        await expect(refund(orderId, 30)).resolves.toMatchObject({ success: true, status: 201 });
        const stored = await paymentOf(orderId);
        const refundId = String(stored.refunds[0]._id);
        const oldAttempt = new Date(0);
        await setRefundField(stored._id, 'nextAttemptAt', new Date(0));
        const claimed = await paymentRepository.claimRefund(String(stored._id), refundId, {
            now: new Date(),
            staleBefore: new Date(0)
        });
        expect(claimed?.refunds[0].status).toBe('pending');

        const late = await paymentRepository.failRefund(String(stored._id), refundId, {
            reason: 'unknown',
            attempt: oldAttempt
        });
        const settledLate = await paymentRepository.settleRefund(String(stored._id), refundId, {
            attempt: oldAttempt
        });

        expect([late, settledLate]).toEqual([null, null]);
        await expect(firstRefund(orderId)).resolves.toMatchObject({ status: 'pending' });
    });
});

describe('a provider that is no longer registered', () => {
    it('ends the refund as provider_removed, once, without asking anyone', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidOrder();
            jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(new Error('down'));
            await expect(refund(orderId, 30)).resolves.toMatchObject({
                success: true,
                status: 201
            });
            const stored = await paymentOf(orderId);
            await paymentModel.collection.updateOne(
                { _id: stored._id },
                { $set: { provider: 'retired', updatedAt: new Date(0) } }
            );
            await setRefundField(stored._id, 'nextAttemptAt', new Date(0));
            const spy = jest.spyOn(fakePaymentProvider, 'refund').mockClear();

            await paymentService.retryOpenRefunds();
            await paymentModel.collection.updateOne(
                { _id: stored._id },
                { $set: { updatedAt: new Date(0) } }
            );
            await paymentService.retryOpenRefunds();

            const after = await paymentOf(orderId);
            expect(spy).not.toHaveBeenCalled();
            expect(after.refunds[0]).toMatchObject({
                status: 'failed',
                failureReason: 'provider_removed',
                attempts: 2
            });
        }));

    it('does not stop the reconcile sweep for the payments behind it', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_RECONCILE_MINUTES: '0' }, async () => {
            const { orderId } = await paidOrder();
            const stored = await paymentOf(orderId);
            // A payment still waiting at a provider this process does not have.
            await paymentModel.collection.insertOne({
                ...stored.toObject(),
                _id: new Types.ObjectId(),
                orderId: new Types.ObjectId(),
                providerRef: 'gone_pi_1',
                provider: 'retired',
                status: 'processing',
                refunds: [],
                updatedAt: new Date(0)
            });

            await expect(paymentService.reconcileStalePayments()).resolves.toBe(0);
        }));
});

describe('a refund the provider ran but never answered', () => {
    it('is settled from the provider by the sweep, not paid twice', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidOrder();
            const payment = await paymentOf(orderId);
            setFakeRefundTimeout(String(payment.providerRef), true);
            const before = fakeRefundsMade();
            await expect(refund(orderId, 30)).resolves.toMatchObject({
                success: true,
                status: 201
            });
            await expect(firstRefund(orderId)).resolves.toMatchObject({
                failureReason: 'provider_unavailable'
            });

            await paymentService.retryOpenRefunds();

            await expect(firstRefund(orderId)).resolves.toMatchObject({ status: 'succeeded' });
            expect(fakeRefundsMade() - before).toBe(1);
        }));

    it('is adopted, not repeated, once the provider has forgotten the key', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidOrder();
            const payment = await paymentOf(orderId);
            setFakeRefundTimeout(String(payment.providerRef), true);
            const before = fakeRefundsMade();
            await expect(refund(orderId, 30)).resolves.toMatchObject({
                success: true,
                status: 201
            });
            ageFakeRefundKeys(25 * 3_600_000);
            await setRefundField(payment._id, 'createdAt', new Date(Date.now() - 25 * 3_600_000));

            await paymentService.retryOpenRefunds();

            await expect(firstRefund(orderId)).resolves.toMatchObject({ status: 'succeeded' });
            expect(fakeRefundsMade() - before).toBe(1);
        }));

    it('is made fresh when the record is a day old and the provider holds nothing for it', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId } = await paidOrder();
            const payment = await paymentOf(orderId);
            setFakeRefundFailure(String(payment.providerRef), 'unknown');
            await expect(refund(orderId, 30)).resolves.toMatchObject({
                success: true,
                status: 201
            });
            setFakeRefundFailure(String(payment.providerRef), undefined);
            await setRefundField(payment._id, 'createdAt', new Date(Date.now() - 25 * 3_600_000));
            const before = fakeRefundsMade();

            await paymentService.retryOpenRefunds();

            await expect(firstRefund(orderId)).resolves.toMatchObject({ status: 'succeeded' });
            expect(fakeRefundsMade() - before).toBe(1);
        }));
});
