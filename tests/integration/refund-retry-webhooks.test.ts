/**
 * @module
 * A cancel's refund rides the `order.canceled` outbox row, nothing else. The row is written with
 * the cancel; `payments` opens its refund record when the relay delivers it; a redelivery refunds
 * nothing twice and re-sends no webhook (`webhooks` dedupes on the event id); a provider that
 * refuses leaves the record open for the refund sweep. Cross-module by nature — orders, payments
 * and webhooks' real `subscribe()` hooks all in play — so it lives here rather than in any one
 * module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { withEnvironmentOverrides } from '@tests/environment';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import { callerAs, asCustomer, TEST_TENANT_ID, callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { orderService } from '@modules/orders';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments/services';
import { paymentRepository } from '@modules/payments/repository';
import { fakePaymentProvider } from '@scenarios/support/doubles/payments/fake';
import webhooksModule from '@modules/webhooks/module';
import { create as createSubscription } from '@modules/webhooks/services/subscriptions';
import { webhookDeliveryRepository } from '@modules/webhooks/repository';
import { payByCard } from '@modules/payments/tests/factories';
import { asSuccess } from '@tests/response';

setupTestDb();

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** One order, paid by card — the fixture this whole suite cancels and retries. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: '20.00' });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 1 }],
        callerContextAs('admin')
    );
    const order = asSuccess(created).data;
    await payByCard(order, user);
    // Delivery is after the response: let the relay publish the settlement's rows before the
    // test cancels, as a real cancel arrives a request later.
    await settleOutboxNudges();
    return { user, order };
};

/** The one `order.canceled` row a cancel of this order wrote. */
const canceledRows = (orderId: string) =>
    outboxEventModel.find({ name: 'order.canceled', aggregateId: orderId }).lean().exec();

/** Webhook deliveries made for `order.canceled`, whoever subscribed. */
const canceledDeliveries = () =>
    webhookDeliveryRepository.findAll({ tenant: TEST_TENANT_ID, eventType: 'order.canceled' });

/** A subscriber to everything, so a second delivery would show. */
const subscribeToEverything = () =>
    createSubscription(
        { url: 'https://example.com/hook', eventTypes: ['*'] },
        { caller: callerAs('manager'), analyticsConsent: false }
    );

beforeEach(() => {
    registerCheckoutModules([paymentsModule, webhooksModule]);
});

it('writes one outbox row with the cancel, and the refund lands once the relay has delivered it', async () => {
    const { user, order } = await paidOrder();
    const orderId = String(order._id);

    await orderService.cancelOnRequestById(orderId, asCustomer(user.id));

    expect(await canceledRows(orderId)).toHaveLength(1);
    await settleOutboxNudges();
    const payment = await paymentRepository.findByOrderId(orderId);
    expect(payment!.refunds).toHaveLength(1);
    expect(payment!.refunds[0]).toMatchObject({ amount: '20.00', status: 'succeeded' });
    const [row] = await canceledRows(orderId);
    expect(row).toMatchObject({ status: 'published' });
});

it('refunds nothing twice and sends no second webhook when the row is delivered again', async () => {
    await subscribeToEverything();
    const { user, order } = await paidOrder();
    const orderId = String(order._id);
    const refundSpy = jest.spyOn(fakePaymentProvider, 'refund');

    await orderService.cancelOnRequestById(orderId, asCustomer(user.id));
    await settleOutboxNudges();
    const [delivered] = await canceledRows(orderId);

    // A crash after the consumers returned but before the row was marked published, in effect.
    await outboxEventModel.updateOne(
        { _id: delivered._id },
        { $set: { status: 'pending', nextAttemptAt: new Date(0) } }
    );
    await relayOutbox();

    expect(refundSpy).toHaveBeenCalledTimes(1);
    expect((await paymentRepository.findByOrderId(orderId))!.refunds).toHaveLength(1);
    expect(await canceledDeliveries()).toHaveLength(1);
});

it('leaves a refund the provider refused open for the sweep, and answers the event', () =>
    withEnvironmentOverrides({ NODE_PAYMENT_REFUND_RETRY_MINUTES: '0' }, async () => {
        await subscribeToEverything();
        const { user, order } = await paidOrder();
        const orderId = String(order._id);
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(
            new Error('payment provider unreachable')
        );

        await orderService.cancelOnRequestById(orderId, asCustomer(user.id));
        await settleOutboxNudges();

        const stuck = await paymentRepository.findByOrderId(orderId);
        expect(stuck!.refunds[0]).toMatchObject({ status: 'failed' });
        // The record is the promise now, so the event is delivered and not retried.
        const [row] = await canceledRows(orderId);
        expect(row).toMatchObject({
            status: 'published',
            attempts: 0
        });

        expect(await paymentService.retryOpenRefunds()).toBe(1);
        expect((await paymentRepository.findByOrderId(orderId))!.refunds[0]).toMatchObject({
            status: 'succeeded'
        });
        expect(await canceledDeliveries()).toHaveLength(1);
    }));
