/**
 * @module
 * `cancelled` — what a payment says once its order is gone. Written only after the provider
 * confirms the intent closed; money that still lands on it is recorded and returned, and every
 * other late report leaves it alone.
 *
 * The provider's side is the fake PSP: "a late report" is `setFakeOutcome` / `confirm` at the
 * provider with the application told only through the settlement entry points.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { createOrder, toOrderItem } from '@modules/orders/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import {
    applyWebhookSettlement,
    createIntent,
    reconcileStalePayments,
    syncPayment
} from '@modules/payments/services';
import { PAYMENT_FAILED } from '@modules/payments/events';
import { paymentModel } from '@modules/payments/model';
import { paymentRepository } from '@modules/payments/repository';
import { presentPayment } from '@modules/payments/presenter';
import { withEnvironment } from '@tests/environment';
import { fakePaymentProvider, setFakeOutcome } from '@scenarios/support/doubles/payments/fake';
import paymentsModule from '@modules/payments/module';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext } from '@tests/callers';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([paymentsModule]);
});

afterEach(() => {
    resetDomainEvents();
});

/** One field of an order's payment, read back. */
const statusOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => payment?.status);

/** How many refund records an order's payment holds. */
const refundCountOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => payment?.refunds.length);

/** The provider's reference for an order's payment. */
const providerRefOf = (orderId: string) =>
    paymentRepository.findByOrderId(orderId).then((payment) => payment?.providerRef);

/** The order's own status. */
const orderStatusOf = (orderId: string) =>
    orderService.getById(orderId).then((order) => order?.status);

/** An order with a card intent nobody confirmed, then cancelled and drained. */
const cancelledOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 25, onHand: 10 });
    const order = await createOrder(user, [toOrderItem(product, 2)]);
    const orderId = String(order._id);
    await createIntent(orderId, asCustomer(user.id));
    const providerRef = String(await providerRefOf(orderId));
    await orderService.cancelById(orderId, asCustomer(user.id));
    // `order.cancelled` reaches the listener through the outbox, not inline.
    await settleOutboxNudges();
    return { user, orderId, providerRef };
};

describe('cancelling an order with an open intent', () => {
    it('writes `cancelled` once the provider has closed the intent', async () => {
        const { orderId } = await cancelledOrder();

        const payment = await paymentRepository.findByOrderId(orderId);

        expect(payment?.status).toBe('cancelled');
        expect(presentPayment(payment!).displayStatus).toBe('cancelled');
    });

    it('writes `cancelled` for a payment that never reached the provider', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25, onHand: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const orderId = String(order._id);
        await paymentModel.create({
            orderId: order._id,
            userId: user._id,
            amount: 25,
            currency: 'EUR',
            status: 'requires_confirmation',
            provider: 'fake',
            method: 'card',
            amountRefunded: 0,
            refunds: []
        });

        await orderService.cancelById(orderId, asCustomer(user.id));
        await settleOutboxNudges();

        expect(await statusOf(orderId)).toBe('cancelled');
    });

    it('leaves the payment as it was when the provider refuses to close the intent', async () => {
        const user = await createUser();
        const product = await createProduct({ price: 25, onHand: 10 });
        const order = await createOrder(user, [toOrderItem(product, 1)]);
        const orderId = String(order._id);
        await createIntent(orderId, asCustomer(user.id));
        jest.spyOn(fakePaymentProvider, 'cancel').mockRejectedValueOnce(new Error('down'));

        await orderService.cancelById(orderId, asCustomer(user.id));
        await settleOutboxNudges();

        expect(await statusOf(orderId)).toBe('requires_confirmation');
    });
});

describe('a late report on a cancelled payment', () => {
    it.each(['processing', 'declined'] as const)(
        'moves nothing and announces nothing for `%s`',
        async (status) => {
            const { orderId, providerRef } = await cancelledOrder();
            setFakeOutcome(providerRef, { status });

            await applyWebhookSettlement(providerRef);
            await settleOutboxNudges();

            expect(await statusOf(orderId)).toBe('cancelled');
            expect(await outboxEventModel.countDocuments({ name: PAYMENT_FAILED })).toBe(0);
        }
    );

    it('is not re-read by the buyer sync', async () => {
        const { user, orderId } = await cancelledOrder();
        const payment = await paymentRepository.findByOrderId(orderId);

        const answer = await syncPayment(
            String(payment?._id),
            asCustomer(user.id),
            testCallerContext
        );

        expect(answer.success && answer.data.status).toBe('cancelled');
    });

    it('is recorded as `succeeded` and returned in full when money landed on it', async () => {
        const { orderId, providerRef } = await cancelledOrder();
        await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');

        await applyWebhookSettlement(providerRef);

        const payment = await paymentRepository.findByOrderId(orderId);
        expect(payment?.status).toBe('succeeded');
        expect(payment?.refunds).toHaveLength(1);
        expect(presentPayment(payment!).displayStatus).toBe('refunded');
        expect(await orderStatusOf(orderId)).toBe('cancelled');
    });

    it('is a no-op the second time, so a redelivered success refunds once', async () => {
        const { orderId, providerRef } = await cancelledOrder();
        await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');
        await applyWebhookSettlement(providerRef);

        await applyWebhookSettlement(providerRef);

        expect(await refundCountOf(orderId)).toBe(1);
    });

    it('is skipped by the reconciliation sweep', () =>
        withEnvironment('NODE_PAYMENT_RECONCILE_MINUTES', '0', async () => {
            const { orderId, providerRef } = await cancelledOrder();
            await fakePaymentProvider.confirm(providerRef, 'pm_card_visa');

            expect(await reconcileStalePayments()).toBe(0);

            expect(await statusOf(orderId)).toBe('cancelled');
        }));
});

describe('the retention reaper', () => {
    it('deletes an old cancelled payment and keeps an old succeeded one', async () => {
        const { orderId } = await cancelledOrder();
        const buyer = await createUser({ email: 'second@example.com' });
        const product = await createProduct({ price: 10, onHand: 5 });
        const paidOrder = await createOrder(buyer, [toOrderItem(product, 1)]);
        const kept = await paymentModel.create({
            orderId: paidOrder._id,
            amount: 10,
            currency: 'EUR',
            status: 'succeeded',
            provider: 'fake',
            method: 'card',
            amountRefunded: 0,
            refunds: []
        });
        const future = new Date(Date.now() + 60_000);

        const deleted = await paymentRepository.deleteAbandonedBefore(future);

        expect(deleted).toBe(1);
        expect(await paymentRepository.findByOrderId(orderId)).toBeNull();
        expect(await paymentModel.exists({ _id: kept._id })).not.toBeNull();
    });
});
