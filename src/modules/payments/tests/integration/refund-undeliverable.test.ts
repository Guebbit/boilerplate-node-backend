/**
 * @module
 * A refund that cannot reach the card tells the buyer once, asks how they want the money, and says
 * no reason: a refusal that ended the retrying, a settled refund the bank sent back, and a return's
 * refund alike. A refusal that says nothing about the buyer's card mails nobody. The order page
 * reads `owedAnotherWay` instead of "retried automatically". Real Mongo, the mailer mocked.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { enqueueEmail } from '@infrastructure/adapters/mailer';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { inventoryService } from '@modules/inventory';
import { resetDomainEvents } from '@kernel/events';
import { settleOutboxNudges } from '@kernel/outbox';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import paymentsModule from '@modules/payments/module';
import {
    refundRefOfRecord,
    setFakeLateRefundFailure,
    setFakeRefundFailure
} from '@scenarios/support/doubles/payments/fake';
import { withEnvironmentOverrides } from '@tests/environment';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asAdmin, asCustomer, callerContextAs } from '@tests/callers';
import { eventually } from '@tests/eventually';
import { payByCard, refundForReturn, refundOrderPayment } from '@modules/payments/tests/factories';
import type { RefundFailureReason } from '@types';

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

/** The mails queued so far under one template name. */
const mailsOf = (template: string) =>
    mockEnqueueEmail.mock.calls.filter(([, name]) => name === template);

/** Lets the outbox deliver everything written so far. */
const settle = () => eventually(() => settleOutboxNudges().then(() => true));

/** A customer who paid 100.00 by card, and a lever that makes the provider refuse refunds. */
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
    const providerRef = String(payment?.providerRef);
    return {
        user,
        orderId,
        providerRef,
        refuseWith: (reason: RefundFailureReason | undefined) =>
            setFakeRefundFailure(providerRef, reason)
    };
};

/** Operator refund of `amount`. */
const refund = (orderId: string, amount: number) =>
    refundOrderPayment(orderId, asAdmin(), callerContextAs('admin'), { amount });

describe('a refund the provider refused for good', () => {
    it('mails the buyer once, without a reason, and the buyer view says it is owed another way', async () => {
        const { user, orderId, refuseWith } = await paidOrder();
        refuseWith('lost_or_stolen_card');

        await refund(orderId, 30);
        await settle();

        expect(mailsOf('payments.refund-undeliverable')).toHaveLength(1);
        const [[message, , data]] = mailsOf('payments.refund-undeliverable');
        expect(message.to).toBeDefined();
        expect(JSON.stringify(data)).not.toMatch(/lost|stolen/i);
        expect(String(data.body)).toContain('30.00');

        const buyerView = await paymentService.getForOrder(orderId, asCustomer(user.id));
        expect(buyerView.data?.refunds[0]).toMatchObject({ owedAnotherWay: true });
        expect(buyerView.data?.refunds[0]).not.toHaveProperty('failureReason');
    });

    it('stays one mail when the refusal turns final after a transient one', () =>
        withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
            const { orderId, refuseWith } = await paidOrder();
            refuseWith('provider_unavailable');
            await refund(orderId, 30);
            await settle();
            expect(mailsOf('payments.refund-undeliverable')).toHaveLength(0);

            refuseWith('declined');
            await paymentService.retryOpenRefunds();
            await paymentService.retryOpenRefunds();
            await settle();

            expect(mailsOf('payments.refund-undeliverable')).toHaveLength(1);
        }));

    it('mails a refused return refund too', async () => {
        const { orderId, refuseWith } = await paidOrder();
        refuseWith('declined');

        await refundForReturn(
            orderId,
            { returnId: '64b64c4f4f4f4f4f4f4f4f4f', amount: 50, lines: [], shipping: 0 },
            callerContextAs('manager')
        );
        await settle();

        expect(mailsOf('payments.refund-undeliverable')).toHaveLength(1);
    });

    it('is cleared by a hand settle, which sends the success mail instead', async () => {
        const { user, orderId, refuseWith } = await paidOrder();
        refuseWith('declined');
        await refund(orderId, 30);
        const payment = await paymentRepository.findByOrderId(orderId);

        await paymentService.settleRefundByHand(
            String(payment?._id),
            String(payment?.refunds[0]._id),
            asAdmin(),
            callerContextAs('admin')
        );
        await settle();

        const buyerView = await paymentService.getForOrder(orderId, asCustomer(user.id));
        expect(buyerView.data?.refunds[0]).not.toHaveProperty('owedAnotherWay');
        expect(mailsOf('payments.refund-issued')).toHaveLength(1);
    });
});

describe.each(['provider_unavailable', 'unknown', 'insufficient_funds'] as const)(
    'a refund refused as %s',
    (reason) => {
        it('mails nobody: it says nothing about the buyer card', async () => {
            const { user, orderId, refuseWith } = await paidOrder();
            refuseWith(reason);

            await refund(orderId, 30);
            await settle();

            expect(mailsOf('payments.refund-undeliverable')).toHaveLength(0);
            const buyerView = await paymentService.getForOrder(orderId, asCustomer(user.id));
            expect(buyerView.data?.refunds[0]).not.toHaveProperty('owedAnotherWay');
        });
    }
);

describe('a settled refund the bank sent back', () => {
    it('mails the buyer once with the same template', async () => {
        const { orderId, providerRef } = await paidOrder();
        await refund(orderId, 30);
        await settle();
        const payment = await paymentRepository.findByOrderId(orderId);
        const refundRef = refundRefOfRecord(String(payment?.refunds[0]._id)) ?? '';
        mockEnqueueEmail.mockClear();

        setFakeLateRefundFailure(refundRef, 'expired_or_canceled_card');
        await paymentService.applyWebhookDelivery({ id: 'evt', providerRef, refundRef }, 'fake');
        await paymentService.applyWebhookDelivery({ id: 'evt', providerRef, refundRef }, 'fake');
        await settle();

        expect(mailsOf('payments.refund-undeliverable')).toHaveLength(1);
    });
});
