/**
 * @module
 * B6: retrying a stuck refund must never re-deliver the cancellation webhook. `payments` used to
 * subscribe to the same `ORDER_CANCELLED` event `webhooks` fans out on, so the sweep's retry
 * (re-announcing that event just to nudge the refund) also created a second `order.cancelled`
 * delivery row for every subscriber, every time a provider outage outlasted one pass. Cross-module
 * by nature — orders, payments and webhooks' real `subscribe()` hooks all in play — so it lives
 * here rather than in any one module's own `tests/`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { withEnvironment } from '@tests/environment';
import { resetDomainEvents } from '@kernel/events';
import { callerAs, testCallerContext, asCustomer, TEST_TENANT_ID } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { orderService } from '@modules/orders';
import paymentsModule from '@modules/payments/module';
import { createIntent, confirmPayment } from '@modules/payments/services';
import { fakePaymentProvider } from '@modules/payments/providers/fake';
import webhooksModule from '@modules/webhooks/module';
import { create as createSubscription } from '@modules/webhooks/services/subscriptions';
import { webhookDeliveryRepository } from '@modules/webhooks/repository';

setupTestDb();

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** One order, paid by card — the fixture this whole suite cancels and retries. */
const paidOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ price: 20 });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 1 }],
        testCallerContext
    );
    const order = created.data!;
    const intent = await createIntent(String(order._id), asCustomer(user.id));
    await confirmPayment(
        String(intent.success && intent.data?.id),
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    return { user, order };
};

it('retries the owed refund without re-announcing the cancellation, and delivers it once', () =>
    withEnvironment('NODE_ORDER_EFFECT_RETRY_MINUTES', '0', async () => {
        registerCheckoutModules([paymentsModule, webhooksModule]);
        await createSubscription(
            { url: 'https://example.com/hook', eventTypes: ['*'] },
            { caller: callerAs('manager'), analyticsConsent: false }
        );

        const { user, order } = await paidOrder();

        // The provider outage this whole mechanism exists for: the refund fails once.
        jest.spyOn(fakePaymentProvider, 'refund').mockRejectedValueOnce(
            new Error('payment provider unreachable')
        );

        await orderService.cancelById(String(order._id), asCustomer(user.id));

        // Failed, so the marker is still owed — the retry is what finishes it, on a second,
        // successful call to the (no longer mocked) provider.
        expect(await orderService.retryPendingEffects()).toBe(1);

        // `order.cancelled` fired exactly once — on the cancel itself. The retry announces
        // `order.refund_owed` instead (B6), which carries no webhook of its own, so a second
        // `order.cancelled` delivery row here would mean the old bug is back.
        const deliveries = await webhookDeliveryRepository.findAll({
            tenant: TEST_TENANT_ID,
            eventType: 'order.cancelled'
        });
        expect(deliveries).toHaveLength(1);
    }));
