/**
 * @module
 * An operator's standalone refund (`POST /payments/order/:orderId/refund`) fans out a
 * `payment.refunded` webhook delivery, carrying the amount and currency actually returned —
 * proved through the real registry indirection, same shape as
 * `./refund-retry-webhooks.test.ts`: `payments` never imports `webhooks`, so this is the only way
 * to prove the wiring rather than reading `module.ts`'s `publicEvents` map for it.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { resetDomainEvents } from '@kernel/events';
import { callerAs, asAdmin, TEST_TENANT_ID, callerContextAs } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { orderService } from '@modules/orders';
import paymentsModule from '@modules/payments/module';
import { paymentService } from '@modules/payments/services';
import webhooksModule from '@modules/webhooks/module';
import { create as createSubscription } from '@modules/webhooks/services/subscriptions';
import { webhookDeliveryRepository } from '@modules/webhooks/repository';
import { eventually } from '@tests/eventually';
import { payByCard } from '@modules/payments/tests/factories';
import { asSuccess } from '@tests/response';

setupTestDb();

afterEach(() => {
    resetDomainEvents();
});

/** One order, paid by card — refundable once, same fixture shape as the retry-webhooks suite. */
const paidOrder = async (price: number) => {
    const user = await createUser();
    const product = await createProduct({ price });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 1 }],
        callerContextAs('admin')
    );
    const order = asSuccess(created).data;
    await payByCard(order, user);
    return { user, order };
};

/** The `payment.refunded` deliveries recorded for the test tenant. */
const refundDeliveries = () =>
    webhookDeliveryRepository.findAll({
        tenant: TEST_TENANT_ID,
        eventType: 'payment.refunded'
    });

it('an admin refund fans out a payment.refunded delivery carrying the amount and currency', async () => {
    registerCheckoutModules([paymentsModule, webhooksModule]);
    await createSubscription(
        { url: 'https://example.com/hook', eventTypes: ['*'] },
        { caller: callerAs('manager'), analyticsConsent: false }
    );

    const { order } = await paidOrder(20);

    const refunded = await paymentService.refundByOrder(
        String(order._id),
        asAdmin(),
        callerContextAs('admin')
    );
    expect(refunded.success).toBe(true);
    const currency = refunded.success ? refunded.data.currency : undefined;

    // `markRefunded` fires `PAYMENT_REFUNDED` fire-and-forget, so the delivery row lands after
    // `refundByOrder` resolved: two real Mongo round-trips (`findEnabled`, then `create`).
    await eventually(() => refundDeliveries().then((rows) => rows.length > 0));
    const [delivery] = await refundDeliveries();
    expect(delivery?.payload).toMatchObject({
        orderId: String(order._id),
        amount: 20,
        currency
    });
});
