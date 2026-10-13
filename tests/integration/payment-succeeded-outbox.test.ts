/**
 * The whole path a `payment.succeeded` webhook takes through the outbox, with the real
 * `payments` and `webhooks` modules registered: a settlement ends in exactly one delivery per
 * subscription, and a duplicate publish of the same event does not create a second. See docs/tools/outbox.md.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { createProduct } from '@modules/products/tests/factories';
import { resetDomainEvents } from '@kernel/events';
import { outboxEventModel, relayOutbox, settleOutboxNudges } from '@kernel/outbox';
import { orderService } from '@modules/orders';
import { createIntent, confirmPayment } from '@modules/payments/services';
import paymentsModule from '@modules/payments/module';
import webhooksModule from '@modules/webhooks/module';
import {
    webhookSubscriptionRepository,
    webhookDeliveryRepository
} from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { asCustomer, testCallerContext, callerContextAs } from '@tests/callers';

setupTestDb();

beforeEach(async () => {
    registerCheckoutModules([paymentsModule, webhooksModule]);
    const { entry } = mintRingSecret();
    await webhookSubscriptionRepository.create({
        tenant: 'shop',
        url: 'https://example.test/inbox',
        eventTypes: ['payment.succeeded'],
        enabled: true,
        consecutiveFailures: 0,
        secrets: [entry]
    });
});

afterEach(() => {
    resetDomainEvents();
    jest.restoreAllMocks();
});

/** A paid order: the settlement commits, and its outbox row waits for the relay. */
const settledOrder = async () => {
    const user = await createUser();
    const product = await createProduct({ onHand: 10 });
    const created = await orderService.create(
        user.id,
        user.email,
        [{ productId: String(product._id), quantity: 1 }],
        callerContextAs('admin')
    );
    const order = created.data!;
    const intent = await createIntent(String(order._id), asCustomer(user.id));
    await confirmPayment(
        String(intent.success && intent.data?.id),
        'pm_card_visa',
        asCustomer(user.id),
        testCallerContext
    );
    return order;
};

describe('payment.succeeded through the outbox', () => {
    it('reaches the subscriber once the relay publishes the settlement’s row', async () => {
        const order = await settledOrder();
        await settleOutboxNudges();
        await relayOutbox();

        const deliveries = await webhookDeliveryRepository.findAll({}, { limit: 10 });
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0]).toMatchObject({ eventType: 'payment.succeeded' });
        expect(deliveries[0].payload).toMatchObject({ orderId: String(order._id) });
    });

    it('a duplicate publish of the same event creates no second delivery', async () => {
        await settledOrder();
        await settleOutboxNudges();
        await relayOutbox();
        const [first] = await webhookDeliveryRepository.findAll({}, { limit: 10 });

        // A relay that crashed after publishing but before marking it: the row is pending again.
        await outboxEventModel.updateOne(
            { name: 'payment.succeeded' },
            {
                $set: { status: 'pending', nextAttemptAt: new Date(0) },
                $unset: { publishedAt: 1 }
            }
        );
        expect(await relayOutbox()).toMatchObject({ published: 1 });

        const deliveries = await webhookDeliveryRepository.findAll({}, { limit: 10 });
        expect(deliveries).toHaveLength(1);
        expect(deliveries[0].eventId).toBe(first.eventId);
    });

    it('an outbox event keeps its id as the webhook event id', async () => {
        await settledOrder();
        await settleOutboxNudges();
        await relayOutbox();

        const row = await outboxEventModel.findOne({ name: 'payment.succeeded' }).lean();
        const [delivery] = await webhookDeliveryRepository.findAll({}, { limit: 10 });
        expect(delivery.eventId).toBe(String(row?._id));
    });

    it('a fan-out that fails is retried by the relay, not swallowed', async () => {
        jest.spyOn(webhookDeliveryRepository, 'create').mockRejectedValueOnce(
            new Error('database blip')
        );
        // The settlement's own nudge is the first relay pass, and it hits the blip.
        await settledOrder();
        await settleOutboxNudges();
        expect(await outboxEventModel.findOne({ name: 'payment.succeeded' }).lean()).toMatchObject({
            status: 'pending',
            attempts: 1
        });
        expect(await webhookDeliveryRepository.count({})).toBe(0);

        await outboxEventModel.updateMany(
            { name: 'payment.succeeded' },
            { $set: { nextAttemptAt: new Date(0) } }
        );
        expect(await relayOutbox()).toMatchObject({ published: 1, retried: 0 });
        expect(await webhookDeliveryRepository.count({})).toBe(1);
    });
});
