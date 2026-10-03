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
import {
    callerAs,
    testCallerContext,
    asCustomer,
    asAdmin,
    TEST_TENANT_ID,
    callerContextAs
} from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { orderService } from '@modules/orders';
import paymentsModule from '@modules/payments/module';
import { createIntent, confirmPayment, refundByOrder } from '@modules/payments/services';
import webhooksModule from '@modules/webhooks/module';
import { create as createSubscription } from '@modules/webhooks/services/subscriptions';
import { webhookDeliveryRepository } from '@modules/webhooks/repository';
import type { WebhookDeliveryDocument } from '@modules/webhooks/model';
import type { Lean } from '@infrastructure/persistence/create-repository';

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

/**
 * `markRefunded` fires `PAYMENT_REFUNDED` fire-and-forget (`void emitDomainEvent(...)`, same
 * reasoning as `PAYMENT_SUCCEEDED` in `payments/services/settlement.ts`), so the delivery row lands after
 * `refundByOrder`'s own promise already resolved — polled, same pattern as
 * `payments/tests/integration/settlement-email.test.ts`'s `waitUntil`, since the fan-out is itself
 * two real Mongo round-trips (`findEnabled`, then `create`), not one microtask.
 * @throws {Error} if no matching delivery appears within `timeoutMs`
 */
const waitForDelivery = async (
    orderId: string,
    timeoutMs = 2000
): Promise<Lean<WebhookDeliveryDocument>> => {
    const startedAt = Date.now();
    for (;;) {
        const [delivery] = await webhookDeliveryRepository.findAll({
            tenant: TEST_TENANT_ID,
            eventType: 'payment.refunded'
        });
        if (delivery) return delivery;
        if (Date.now() - startedAt > timeoutMs)
            throw new Error(`waitForDelivery: no payment.refunded delivery for order ${orderId}`);
        await new Promise((resolve) => setTimeout(resolve, 10));
    }
};

it('an admin refund fans out a payment.refunded delivery carrying the amount and currency', async () => {
    registerCheckoutModules([paymentsModule, webhooksModule]);
    await createSubscription(
        { url: 'https://example.com/hook', eventTypes: ['*'] },
        { caller: callerAs('manager'), analyticsConsent: false }
    );

    const { order } = await paidOrder(20);

    const refunded = await refundByOrder(String(order._id), asAdmin(), callerContextAs('admin'));
    expect(refunded.success).toBe(true);
    const currency = refunded.success ? refunded.data.currency : undefined;

    const delivery = await waitForDelivery(String(order._id));
    expect(delivery.payload).toMatchObject({
        orderId: String(order._id),
        amount: 20,
        currency
    });
});
