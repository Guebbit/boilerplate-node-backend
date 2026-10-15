/**
 * @module
 * Fan-out of one public event to the subscriptions that should hear it: only an ENABLED, MATCHING
 * subscription gets a delivery row, and every row of one event carries the same `eventId`
 * (`webhook-id`, what a consumer dedupes on). A disabled subscriber is a third party the owner has
 * cut off, so sending it data anyway would be a leak.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { emitDomainEvent, resetDomainEvents } from '@kernel/events';
import { subscribeToWebhookEvents } from '@modules/webhooks/services/publish';
import {
    webhookSubscriptionRepository,
    webhookDeliveryRepository
} from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import { TEST_TENANT_ID } from '@tests/callers';

jest.mock('@infrastructure/adapters/queue', () => ({
    publishToQueue: () => Promise.resolve(true)
}));

setupTestDb();

afterEach(() => resetDomainEvents());

/** One subscription, saved for real. */
const subscribe = (eventTypes: string[], enabled: boolean) =>
    webhookSubscriptionRepository.create({
        tenant: TEST_TENANT_ID,
        url: 'https://example.invalid/hook',
        eventTypes,
        enabled,
        consecutiveFailures: 0,
        secrets: [mintRingSecret().entry]
    });

/** Wire the fan-out for `order.created`, then announce one order. */
const announceOrder = () => {
    subscribeToWebhookEvents({
        'order.created': {
            toPublicEvent: ({ orderId }: { orderId: string }) => ({
                eventType: 'order.created',
                data: { orderId }
            })
        }
    });
    return emitDomainEvent('order.created', { orderId: 'order_1' });
};

describe('webhook fan-out', () => {
    it('delivers only to the enabled subscription whose filter matches', async () => {
        const matching = await subscribe(['order.created'], true);
        await subscribe(['order.created'], false);
        await subscribe(['payment.succeeded'], true);

        await announceOrder();

        const rows = await webhookDeliveryRepository.findDue(10);
        expect(rows.map((row) => String(row.subscriptionId))).toEqual([String(matching._id)]);
    });

    it('gives every subscription the same eventId for one event', async () => {
        await subscribe(['order.created'], true);
        await subscribe(['*'], true);

        await announceOrder();

        const rows = await webhookDeliveryRepository.findDue(10);
        expect(rows).toHaveLength(2);
        expect(new Set(rows.map((row) => row.eventId)).size).toBe(1);
    });
});
