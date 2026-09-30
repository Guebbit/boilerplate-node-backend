/**
 * The retry sweep (`../../services/sweep.ts`) against a real database, with the queue publish
 * mocked — what it actually enqueues, which is the one thing `delivery.test.ts`'s end-to-end runs
 * never exercise (`processDeliveryJob` there is always called directly against a fixture, never
 * reached through the sweep).
 */

import { setupTestDb } from '@tests/setup-test-db';
import { WORKER_CHANNELS } from '@types';
import {
    webhookSubscriptionRepository,
    webhookDeliveryRepository
} from '@modules/webhooks/repository';
import { sweepDueWebhookDeliveries } from '@modules/webhooks/services/sweep';
import { mintRingSecret } from '@modules/webhooks/secrets';
import { TEST_TENANT_ID } from '@tests/callers';
import type { WebhookSubscriptionDocument } from '@modules/webhooks/model';

const publishToQueueMock = jest.fn<Promise<boolean>, [unknown]>().mockResolvedValue(true);
const deliverWebhookMock = jest.fn();
jest.mock('@modules/webhooks/transport/webhook-delivery', () => ({
    ...jest.requireActual('@modules/webhooks/transport/webhook-delivery'),
    deliverWebhook: (options: unknown) => deliverWebhookMock(options)
}));
jest.mock('@infrastructure/adapters/queue', () => ({
    publishToQueue: (options: unknown) => publishToQueueMock(options)
}));

setupTestDb();

beforeEach(() => {
    publishToQueueMock.mockClear().mockResolvedValue(true);
    deliverWebhookMock.mockReset();
});

/** A subscription document with one ring secret, saved for real. */
const createSubscription = (): Promise<WebhookSubscriptionDocument> => {
    const { entry } = mintRingSecret();

    return webhookSubscriptionRepository.create({
        tenant: TEST_TENANT_ID,
        url: 'https://example.invalid/hook',
        eventTypes: ['*'],
        enabled: true,
        consecutiveFailures: 0,
        secrets: [entry]
    });
};

it('publishes a due pending row, without claiming it', async () => {
    const subscription = await createSubscription();
    const due = await webhookDeliveryRepository.create({
        tenant: TEST_TENANT_ID,
        subscriptionId: subscription._id,
        eventId: 'evt_due',
        eventType: 'order.paid',
        payload: { orderId: 'order_1' },
        attempt: 1,
        status: 'pending',
        nextAttemptAt: new Date(Date.now() - 1000)
    });

    await sweepDueWebhookDeliveries();

    expect(publishToQueueMock).toHaveBeenCalledTimes(1);
    // Claim Check (EIP): the message carries only the row's id — see `../../asyncapi.internal.yaml`.
    expect(publishToQueueMock).toHaveBeenCalledWith({
        queue: WORKER_CHANNELS.WEBHOOK_DELIVER,
        payload: { deliveryId: String(due._id) }
    });

    // Unclaimed: the sweep never sets `in-flight` — see `sweep.ts`'s own docblock for why a
    // duplicate publish is safe without it.
    const stored = await webhookDeliveryRepository.findById(String(due._id));
    expect(stored?.status).toBe('pending');
});

it('republishes a stranded in-flight row whose lease already expired', async () => {
    const subscription = await createSubscription();
    const stranded = await webhookDeliveryRepository.create({
        tenant: TEST_TENANT_ID,
        subscriptionId: subscription._id,
        eventId: 'evt_stranded',
        eventType: 'order.paid',
        payload: { orderId: 'order_2' },
        attempt: 2,
        status: 'in-flight',
        leaseToken: 'a-dead-workers-token',
        leaseExpiresAt: new Date(Date.now() - 1000)
    });

    await sweepDueWebhookDeliveries();

    expect(publishToQueueMock).toHaveBeenCalledWith(
        expect.objectContaining({
            payload: expect.objectContaining({ deliveryId: String(stranded._id) })
        })
    );
});

it('ignores a row still under a live lease', async () => {
    const subscription = await createSubscription();
    await webhookDeliveryRepository.create({
        tenant: TEST_TENANT_ID,
        subscriptionId: subscription._id,
        eventId: 'evt_live',
        eventType: 'order.paid',
        payload: { orderId: 'order_3' },
        attempt: 1,
        status: 'in-flight',
        leaseToken: 'a-live-workers-token',
        leaseExpiresAt: new Date(Date.now() + 60_000)
    });

    await sweepDueWebhookDeliveries();

    expect(publishToQueueMock).not.toHaveBeenCalled();
});

it('ignores a pending row not due yet', async () => {
    const subscription = await createSubscription();
    await webhookDeliveryRepository.create({
        tenant: TEST_TENANT_ID,
        subscriptionId: subscription._id,
        eventId: 'evt_future',
        eventType: 'order.paid',
        payload: { orderId: 'order_4' },
        attempt: 1,
        status: 'pending',
        nextAttemptAt: new Date(Date.now() + 60_000)
    });

    await sweepDueWebhookDeliveries();

    expect(publishToQueueMock).not.toHaveBeenCalled();
});

/** A due row for `subscription`, saved for real. */
const createDue = (subscription: WebhookSubscriptionDocument, eventId: string) =>
    webhookDeliveryRepository.create({
        tenant: TEST_TENANT_ID,
        subscriptionId: subscription._id,
        eventId,
        eventType: 'order.paid',
        payload: { orderId: eventId },
        attempt: 1,
        status: 'pending',
        nextAttemptAt: new Date(Date.now() - 1000)
    });

describe('with no broker to take the message', () => {
    beforeEach(() => {
        publishToQueueMock.mockResolvedValue(false);
        deliverWebhookMock.mockResolvedValue({ success: true, statusCode: 200, durationMs: 5 });
    });

    it('sends the due row itself, and records the outcome', async () => {
        const subscription = await createSubscription();
        const due = await createDue(subscription, 'evt_inline');

        await sweepDueWebhookDeliveries();

        expect(deliverWebhookMock).toHaveBeenCalledTimes(1);
        const stored = await webhookDeliveryRepository.findById(String(due._id));
        expect(stored?.status).toBe('succeeded');
    });

    it('sends every due row once, however many there are', async () => {
        const subscription = await createSubscription();
        await Promise.all(
            ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => createDue(subscription, `evt_${id}`))
        );

        await sweepDueWebhookDeliveries();

        expect(deliverWebhookMock).toHaveBeenCalledTimes(7);
    });

    it('leaves a row under a live lease alone', async () => {
        const subscription = await createSubscription();
        await webhookDeliveryRepository.create({
            tenant: TEST_TENANT_ID,
            subscriptionId: subscription._id,
            eventId: 'evt_leased',
            eventType: 'order.paid',
            payload: { orderId: 'x' },
            attempt: 1,
            status: 'in-flight',
            leaseToken: 'a-live-workers-token',
            leaseExpiresAt: new Date(Date.now() + 60_000)
        });

        await sweepDueWebhookDeliveries();

        expect(deliverWebhookMock).not.toHaveBeenCalled();
    });

    it('does not fail the whole sweep when one send throws', async () => {
        const subscription = await createSubscription();
        await createDue(subscription, 'evt_boom');
        await createDue(subscription, 'evt_fine');
        deliverWebhookMock
            .mockRejectedValueOnce(new Error('disk full'))
            .mockResolvedValue({ success: true, statusCode: 200, durationMs: 5 });

        await expect(sweepDueWebhookDeliveries()).resolves.toBeUndefined();

        expect(deliverWebhookMock).toHaveBeenCalledTimes(2);
    });
});
