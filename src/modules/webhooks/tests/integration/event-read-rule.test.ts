/**
 * @module
 * A subscription hands an event stream to a machine, so writing one needs the read rule of every
 * event it carries. Walks every door that could take over a stream the caller may not read:
 * create, update (narrow-then-redirect included), secret rotation, replay and the delivery
 * itself.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerAs } from '@tests/callers';
import { create, createSecret, list, update } from '../../services/subscriptions';
import { replay } from '../../services/deliveries';
import { processDeliveryJob } from '../../services/attempt';
import { registerWebhookCatalog } from '../../services/catalog';
import { webhookDeliveryRepository, webhookSubscriptionRepository } from '../../repository';

setupTestDb();

beforeAll(() => {
    registerWebhookCatalog(['orders', 'users', 'example']);
});

afterAll(() => {
    registerWebhookCatalog([]);
});

/** The manager reads orders but no accounts; the admin reads both. */
const asManager = { caller: callerAs('manager'), analyticsConsent: false };
const asAdmin = { caller: callerAs('admin'), analyticsConsent: false };

/** An admin-made subscription on `eventTypes`, as the stored row. */
const adminSubscription = async (eventTypes: ('*' | 'user.updated' | 'order.paid')[]) => {
    const result = await create({ url: 'https://hooks.example.com/admin', eventTypes }, asAdmin);
    if (!result.success || !result.data) throw new Error('setup failed: create was refused');
    return result.data.subscription;
};

/** The code of a refusal, or `undefined` for a success. */
const codeOf = (result: { success: boolean; errors?: { code?: string }[] }) =>
    result.success ? undefined : result.errors?.[0]?.code;

describe('create', () => {
    it.each([['user.updated'], ['*']] as const)(
        'refuses a manager subscribing to %s, which names an account they may not read',
        async (eventType) => {
            const result = await create(
                { url: 'https://hooks.example.com/a', eventTypes: [eventType] },
                asManager
            );

            expect(result).toMatchObject({ success: false, status: 403 });
            expect(codeOf(result)).toBe('WEBHOOK_EVENT_READ_REQUIRED');
        }
    );

    it('lets a manager subscribe to an order event, and an admin to everything', async () => {
        const order = await create(
            { url: 'https://hooks.example.com/a', eventTypes: ['order.paid'] },
            asManager
        );
        const everything = await create(
            { url: 'https://hooks.example.com/b', eventTypes: ['*'] },
            asAdmin
        );

        expect(order).toMatchObject({ success: true, status: 201 });
        expect(everything).toMatchObject({ success: true, status: 201 });
    });
});

describe('update', () => {
    it('refuses a manager changing the url of an admin’s stream they may not read', async () => {
        const subscription = await adminSubscription(['user.updated']);

        const result = await update(
            String(subscription._id),
            { url: 'https://evil.example.com/hook' },
            asManager
        );

        expect(codeOf(result)).toBe('WEBHOOK_EVENT_READ_REQUIRED');
        const row = await webhookSubscriptionRepository.findById(String(subscription._id));
        expect(row?.url).toBe('https://hooks.example.com/admin');
    });

    it('refuses narrowing and redirecting an admin’s `*` stream in one call', async () => {
        const subscription = await adminSubscription(['*']);

        const result = await update(
            String(subscription._id),
            { eventTypes: ['order.paid'], url: 'https://evil.example.com/hook' },
            asManager
        );

        expect(codeOf(result)).toBe('WEBHOOK_EVENT_READ_REQUIRED');
        const row = await webhookSubscriptionRepository.findById(String(subscription._id));
        expect(row?.eventTypes).toEqual(['*']);
    });

    it('lets a description-only PATCH through on a stream the manager may not read', async () => {
        const subscription = await adminSubscription(['user.updated']);

        const result = await update(String(subscription._id), { description: 'ours' }, asManager);

        expect(result.success).toBe(true);
    });
});

describe('createSecret', () => {
    it('refuses a manager rotating the secret of a stream they may not read', async () => {
        const subscription = await adminSubscription(['user.updated']);

        const result = await createSecret(String(subscription._id), asManager);

        expect(codeOf(result)).toBe('WEBHOOK_EVENT_READ_REQUIRED');
        const row = await webhookSubscriptionRepository.findById(String(subscription._id));
        expect(row?.secrets).toHaveLength(1);
    });

    it('shows the manager that rotating is off, and the admin that it is on', async () => {
        await adminSubscription(['user.updated']);

        const asSeenByManager = await list(asManager, {});
        const asSeenByAdmin = await list(asAdmin, {});

        expect(asSeenByManager.items[0]?.actions.createSecret).toBe(false);
        expect(asSeenByAdmin.items[0]?.actions.createSecret).toBe(true);
    });
});

/** A stored delivery of `eventType` on `subscription`. */
const deliveryOf = (
    subscription: Awaited<ReturnType<typeof adminSubscription>>,
    eventType: string
) =>
    webhookDeliveryRepository.create({
        tenant: subscription.tenant,
        subscriptionId: subscription._id,
        eventId: `evt-${eventType}`,
        eventType,
        payload: { userId: 'u1' },
        attempt: 1,
        status: 'pending',
        nextAttemptAt: new Date()
    });

describe('a delivery', () => {
    it('is not replayable by a caller who may not read its event, and the row is left alone', async () => {
        const subscription = await adminSubscription(['*']);
        const delivery = await deliveryOf(subscription, 'user.updated');

        const result = await replay(String(delivery._id), asManager);

        expect(codeOf(result)).toBe('WEBHOOK_EVENT_READ_REQUIRED');
        const row = await webhookDeliveryRepository.findById(String(delivery._id));
        expect(row?.status).toBe('pending');
    });

    it('is abandoned, not sent, once the subscription no longer names its event', async () => {
        const subscription = await adminSubscription(['order.paid']);
        const delivery = await deliveryOf(subscription, 'user.updated');

        await processDeliveryJob({ deliveryId: String(delivery._id) });

        const row = await webhookDeliveryRepository.findById(String(delivery._id));
        expect(row).toMatchObject({
            status: 'exhausted',
            error: 'Event no longer matches the subscription filter'
        });
    });
});
