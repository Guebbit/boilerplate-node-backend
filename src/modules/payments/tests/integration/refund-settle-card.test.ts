/**
 * @module
 * Marking a REFUSED card refund returned by hand: only a refusal that proves the money did not move
 * may be settled, an unclear one or an attempt in flight answers 409, and a settled one is never
 * sent to the provider again. Real Mongo, through the services' public door.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { paymentModel } from '@modules/payments/model';
import { PAYMENT_REFUNDED } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import {
    fakePaymentProvider,
    setFakeRefundFailure
} from '@scenarios/support/doubles/payments/fake';
import { withEnvironmentOverrides } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, callerContextAs } from '@tests/callers';
import { asReject } from '@tests/response';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';
import type { RefundFailureReason } from '@types';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A card payment of 100.00 whose first refund of 30.00 the provider refuses with `reason`. */
const refusedRefund = async (reason: RefundFailureReason) => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    await payByCard(order, user);
    await settleOutboxNudges();
    const orderId = String(order._id);
    const before = await paymentRepository.findByOrderId(orderId);
    setFakeRefundFailure(String(before?.providerRef), reason);
    await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
    const payment = await paymentRepository.findByOrderId(orderId);
    if (!payment) throw new Error('no payment');
    return { orderId, payment, refundId: String(payment.refunds[0]._id) };
};

/** The operator's settle. */
const settle = (paymentId: string, refundId: string) =>
    paymentService.settleRefundByHand(paymentId, refundId, asAdmin(), callerContextAs('admin'));

describe.each([
    'declined',
    'insufficient_funds',
    'expired_or_canceled_card',
    'lost_or_stolen_card'
] as const)('a card refund refused as %s', (reason) => {
    it('may be marked returned: one settlement, offered in actions, never sent again', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, payment, refundId } = await refusedRefund(reason);
            const offered = await paymentService.getForOrder(orderId, asAdmin());
            expect(offered.data?.actions?.settleByHand).toEqual([refundId]);

            const result = await settle(String(payment._id), refundId);

            expect(result.success).toBe(true);
            const after = await paymentRepository.findByOrderId(orderId);
            expect(after?.refunds[0]).toMatchObject({ status: 'succeeded', settledByHand: true });
            await settleOutboxNudges();
            expect(await outboxEventModel.countDocuments({ name: PAYMENT_REFUNDED })).toBe(1);
            const spy = jest.spyOn(fakePaymentProvider, 'refund').mockClear();
            await paymentService.retryOpenRefunds();
            expect(spy).not.toHaveBeenCalled();
        }));
});

describe.each(['provider_unavailable', 'unknown'] as const)(
    'a card refund left unclear as %s',
    (reason) => {
        it('answers 409 PAYMENT_REFUND_IN_FLIGHT, offers nothing, and writes nothing', async () => {
            const { orderId, payment, refundId } = await refusedRefund(reason);
            const offered = await paymentService.getForOrder(orderId, asAdmin());
            expect(offered.data?.actions?.settleByHand).toEqual([]);

            const result = await settle(String(payment._id), refundId);

            expect(asReject(result).status).toBe(409);
            expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_IN_FLIGHT');
            const after = await paymentRepository.findByOrderId(orderId);
            expect(after?.refunds[0].status).toBe('failed');
        });
    }
);

describe('a card refund whose attempt is running', () => {
    it('answers 409 PAYMENT_REFUND_IN_FLIGHT while pending', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, payment, refundId } = await refusedRefund('provider_unavailable');
            await paymentRepository.claimRefund(String(payment._id), refundId, {
                now: new Date(),
                staleBefore: new Date(0)
            });
            const claimed = await paymentRepository.findByOrderId(orderId);
            expect(claimed?.refunds[0].status).toBe('pending');

            const result = await settle(String(payment._id), refundId);

            expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_IN_FLIGHT');
        }));

    it('answers the same to a settle that loses a claim made between its read and its write', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, payment, refundId } = await refusedRefund('insufficient_funds');
            const settleWrite = paymentRepository.settleRefund.bind(paymentRepository);
            jest.spyOn(paymentRepository, 'settleRefund').mockImplementationOnce(
                async (...args) => {
                    await paymentRepository.claimRefund(String(payment._id), refundId, {
                        now: new Date(),
                        staleBefore: new Date(0)
                    });
                    return settleWrite(...args);
                }
            );

            const result = await settle(String(payment._id), refundId);

            expect(asReject(result).status).toBe(409);
            expect(asReject(result).errors[0].code).toBe('PAYMENT_REFUND_IN_FLIGHT');
            const after = await paymentRepository.findByOrderId(orderId);
            expect(after?.refunds[0].status).toBe('pending');
        }));
});

describe('what needs attention', () => {
    it('lists a refund refused for good at once, as refused_refund', async () => {
        const { orderId } = await refusedRefund('lost_or_stolen_card');

        const { items } = await paymentService.listAttention();

        expect(
            items.map(({ kind, orderId: id, failureReason }) => [kind, id, failureReason])
        ).toEqual([['refused_refund', orderId, 'lost_or_stolen_card']]);
    });

    it('keeps a retryable refusal off the list until the threshold, then lists it as stale_refund', async () => {
        const { orderId, payment } = await refusedRefund('provider_unavailable');
        await expect(paymentService.listAttention()).resolves.toEqual({ items: [] });

        await paymentModel.collection.updateOne(
            { _id: payment._id },
            { $set: { 'refunds.0.createdAt': new Date(Date.now() - 3 * 3_600_000) } }
        );

        const { items } = await paymentService.listAttention();
        expect(items.map(({ kind, orderId: id }) => [kind, id])).toEqual([
            ['stale_refund', orderId]
        ]);
    });

    it('lists an old final refusal once, not as stale as well', async () => {
        const { payment } = await refusedRefund('declined');
        await paymentModel.collection.updateOne(
            { _id: payment._id },
            { $set: { 'refunds.0.createdAt': new Date(Date.now() - 3 * 3_600_000) } }
        );

        const { items } = await paymentService.listAttention();

        expect(items.map(({ kind }) => kind)).toEqual(['refused_refund']);
    });
});
