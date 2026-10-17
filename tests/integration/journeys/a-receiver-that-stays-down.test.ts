/**
 * @module
 * Journey: a receiver that stays down.
 *
 * A subscription points at an endpoint that answers 500 to everything. Each event gets a chain of
 * six attempts along the backoff ladder and then gives up. Five given-up chains in a row are not
 * enough on their own: the subscription must also have been failing for three days. Once both
 * hold it switches itself off, tells its owner, and leaves a system audit row. Switching it back
 * on starts a clean streak.
 *
 * Asserts the chain across modules only; the ladder itself has its own tests.
 */
import '@tests/contract';
import { ListAuditEntries200Response, ListWebhookSubscriptions200Response } from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { api, authenticateAs, loginBearer } from '@tests/http';
import { advanceDate, freezeDate } from '@tests/clock';
import { bodyOf } from '@tests/body-of';
import { drain } from '@tests/drain';
import { mailsTo, useOutboxMail } from '@tests/journey-mail';
import { startWebhookReceiver, type WebhookReceiver } from '@tests/webhook-receiver';
import { newShopper, placeOrder } from '@tests/journey-orders';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { createProduct } from '@modules/products/tests/factories';

setupTestDb();

beforeEach(useOutboxMail);

let receiver: WebhookReceiver | undefined;

afterEach(async () => {
    jest.useRealTimers();
    await receiver?.stop();
    receiver = undefined;
});

/** An hour and a day, in milliseconds. */
const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/**
 * Walks every pending chain to its end: one sweep per attempt, six in all, with the clock moved
 * past the longest wait (10 hours) between them.
 */
const runLadder = async () => {
    for (let attempt = 0; attempt < 6; attempt += 1) {
        await drain('sweep:webhook-retries');
        advanceDate(11 * HOUR_MS);
    }
};

it('switches itself off after five dead chains and three failing days, then starts clean', async () => {
    freezeDate();
    const endpoint = await startWebhookReceiver();
    receiver = endpoint;
    endpoint.answerWith(500);
    const product = await createProduct({ price: 20, onHand: 20 });
    const productId = String(product._id);
    const { user: admin } = await authenticateAs('admin');
    const subscribed = await api()
        .post('/webhooks/subscriptions')
        .set('Authorization', await loginBearer(admin.email))
        .send({ url: `${endpoint.url}/hook`, eventTypes: ['order.created'] })
        .expect(201);
    const subscriptionId = String(subscribed.body.data.id);

    /** The subscription as its owner lists it. */
    const subscription = async () => {
        const { items } = bodyOf(
            await api()
                .get('/webhooks/subscriptions')
                .set('Authorization', await loginBearer(admin.email)),
            ListWebhookSubscriptions200Response
        ).data;
        return items.find(({ id }) => id === subscriptionId);
    };

    /**
     * One more order, which is one more `order.created` for the endpoint to fail. A shopper of its
     * own each time, because an account may hold only two unpaid orders.
     */
    const placeOne = async () => {
        const { bearer } = await newShopper();
        return placeOrder(bearer, [{ productId, quantity: 1 }]);
    };

    // Five events, five dead chains: still on, because the failing has lasted hours, not days.
    for (let event = 0; event < 5; event += 1) await placeOne();
    await runLadder();
    expect(await subscription()).toMatchObject({ enabled: true, consecutiveFailures: 5 });
    expect(mailsTo(admin.email, 'webhooks.subscription-disabled')).toHaveLength(0);

    // Three days on, one more dead chain meets both conditions.
    advanceDate(3 * DAY_MS);
    await placeOne();
    await runLadder();
    expect(await subscription()).toMatchObject({ enabled: false });
    expect(mailsTo(admin.email, 'webhooks.subscription-disabled')).toHaveLength(1);
    const audit = bodyOf(
        await api()
            .get('/audit')
            .query({ pageSize: 100 })
            .set('Authorization', await loginBearer(admin.email)),
        ListAuditEntries200Response
    ).data.items;
    expect(
        audit.filter(({ action }) => action === 'system.webhook_subscription.auto_disabled')
    ).toHaveLength(1);

    // Switched back on, the streak is gone: the counter is zero and so is its start date, so the
    // three-day floor begins again.
    await api()
        .patch(`/webhooks/subscriptions/${subscriptionId}`)
        .set('Authorization', await loginBearer(admin.email))
        .send({ enabled: true })
        .expect(200);
    expect(await subscription()).toMatchObject({ enabled: true, consecutiveFailures: 0 });
    const stored = await webhookSubscriptionRepository.findById(subscriptionId);
    expect(stored?.failingSince).toBeUndefined();
});
