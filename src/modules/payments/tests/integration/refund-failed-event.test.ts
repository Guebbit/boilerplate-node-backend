/**
 * @module
 * `payment.refund_failed` is announced once per NEW refusal: the first one, or a changed reason. A
 * transient refusal says `final: false` (the sweep retries it), a definite one `final: true`, and a
 * retry that fails the same way is silent. Real Mongo, the fake provider's refusal lever.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { PAYMENT_REFUND_FAILED } from '@modules/payments/events';
import paymentsModule from '@modules/payments/module';
import { setFakeRefundFailure } from '@scenarios/support/doubles/payments/fake';
import { withEnvironmentOverrides } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, callerContextAs } from '@tests/callers';
import { payByCard, refundOrderPayment } from '@modules/payments/tests/factories';
import type { RefundFailureReason } from '@types';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
});

/** A paid order, and a lever that makes its refunds fail with the reason it is given. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 50 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    await payByCard(order, user);
    await settleOutboxNudges();
    const orderId = String(order._id);
    const payment = await paymentRepository.findByOrderId(orderId);
    const failWith = (reason: RefundFailureReason | undefined) =>
        setFakeRefundFailure(String(payment?.providerRef), reason);
    return { orderId, failWith };
};

/** The payloads of every `payment.refund_failed` row, oldest first. */
const failedEvents = () =>
    outboxEventModel
        .find({ name: PAYMENT_REFUND_FAILED })
        .sort({ createdAt: 1 })
        .lean()
        .exec()
        .then((rows) => rows.map((row) => row.payload));

describe('payment.refund_failed', () => {
    it('is final for a definite refusal and carries the closed reason', async () => {
        const { orderId, failWith } = await paidOrder();
        failWith('declined');

        await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });
        await settleOutboxNudges();

        expect(await failedEvents()).toEqual([
            expect.objectContaining({
                orderId,
                amount: 30,
                currency: 'EUR',
                failureReason: 'declined',
                final: true
            })
        ]);
    });

    it('is not final for a transient refusal, silent on a repeat, and news again when it turns final', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, failWith } = await paidOrder();
            failWith('provider_unavailable');
            await refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount: 30 });

            await paymentService.retryOpenRefunds();
            await settleOutboxNudges();
            expect(await failedEvents()).toEqual([
                expect.objectContaining({ failureReason: 'provider_unavailable', final: false })
            ]);

            failWith('lost_or_stolen_card');
            await paymentService.retryOpenRefunds();
            await settleOutboxNudges();
            expect(await failedEvents()).toEqual([
                expect.objectContaining({ final: false }),
                expect.objectContaining({ failureReason: 'lost_or_stolen_card', final: true })
            ]);
        }));
});
