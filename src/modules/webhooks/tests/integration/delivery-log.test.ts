/**
 * @module
 * The delivery log's read and the refusals of a replay, against a real database: the log is this
 * tenant's alone and can be narrowed by subscription and by status, and a replay that has nothing
 * to re-send answers 404 without touching the row.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerAs, TEST_TENANT_ID } from '@tests/callers';
import { list, replay } from '../../services/deliveries';
import { webhookDeliveryRepository, webhookSubscriptionRepository } from '../../repository';
import type { WebhookSubscriptionDocument } from '../../model';
import { mintRingSecret } from '../../secrets';

setupTestDb();

/** A tenant caller, as the manager role. */
const context = { caller: callerAs('manager'), analyticsConsent: false };

/** A stored subscription in `tenant`. */
const subscriptionIn = (tenant: string) =>
    webhookSubscriptionRepository.create({
        tenant,
        url: 'https://hooks.example.com/a',
        eventTypes: ['*'],
        secrets: [mintRingSecret().entry]
    });

/** A stored delivery for `subscriptionId` in `tenant`. */
const deliveryFor = (
    subscriptionId: WebhookSubscriptionDocument['_id'],
    tenant: string,
    status: 'pending' | 'succeeded' = 'pending',
    eventId = `evt-${Math.random().toString(36).slice(2)}`
) =>
    webhookDeliveryRepository.create({
        tenant,
        subscriptionId,
        eventId,
        eventType: 'order.paid',
        payload: { orderId: 'o1' },
        attempt: 1,
        status,
        nextAttemptAt: new Date()
    });

describe('listing the delivery log', () => {
    it('lists this tenant’s deliveries only', async () => {
        const mine = await subscriptionIn(TEST_TENANT_ID);
        const theirs = await subscriptionIn('another-tenant');
        const own = await deliveryFor(mine._id, TEST_TENANT_ID);
        await deliveryFor(theirs._id, 'another-tenant');

        const listed = await list(context, {});

        expect(listed.items.map(({ id }) => id)).toEqual([String(own._id)]);
    });

    it('narrows by subscription and by status', async () => {
        const first = await subscriptionIn(TEST_TENANT_ID);
        const second = await subscriptionIn(TEST_TENANT_ID);
        const pendingOnFirst = await deliveryFor(first._id, TEST_TENANT_ID, 'pending');
        const doneOnFirst = await deliveryFor(first._id, TEST_TENANT_ID, 'succeeded');
        await deliveryFor(second._id, TEST_TENANT_ID, 'pending');

        const bySubscription = await list(context, { subscriptionId: String(first._id) });
        const byStatus = await list(context, {
            subscriptionId: String(first._id),
            status: 'succeeded'
        });

        expect(bySubscription.items.map(({ id }) => id).toSorted()).toEqual(
            [String(pendingOnFirst._id), String(doneOnFirst._id)].toSorted()
        );
        expect(byStatus.items.map(({ id }) => id)).toEqual([String(doneOnFirst._id)]);
    });
});

describe('a replay with nothing to re-send', () => {
    it('answers 404 for a delivery that is not in the log', async () => {
        const result = await replay('a'.repeat(24), context);

        expect(!result.success && result.status).toBe(404);
    });

    it('answers 404 for another tenant’s delivery', async () => {
        const theirs = await subscriptionIn('another-tenant');
        const delivery = await deliveryFor(theirs._id, 'another-tenant');

        const result = await replay(String(delivery._id), context);

        expect(!result.success && result.status).toBe(404);
    });

    it('answers 404 once the subscription is gone, and leaves the delivery unclaimed', async () => {
        const subscription = await subscriptionIn(TEST_TENANT_ID);
        const delivery = await deliveryFor(subscription._id, TEST_TENANT_ID, 'succeeded');
        await webhookSubscriptionRepository.deleteOne(subscription);

        const result = await replay(String(delivery._id), context);

        expect(!result.success && result.status).toBe(404);
        const after = await webhookDeliveryRepository.findById(String(delivery._id));
        expect(after?.status).toBe('succeeded');
    });
});
