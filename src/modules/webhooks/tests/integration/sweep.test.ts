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

const publishToQueueMock = jest.fn().mockResolvedValue(true);
jest.mock('@infrastructure/adapters/queue', () => ({
    publishToQueue: (options: unknown) => publishToQueueMock(options)
}));

setupTestDb();

beforeEach(() => publishToQueueMock.mockClear());

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

    // Unclaimed: the sweep no longer sets `in-flight` — see `sweep.ts`'s own docblock for why a
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
