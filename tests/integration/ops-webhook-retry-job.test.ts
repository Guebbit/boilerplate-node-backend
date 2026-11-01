/**
 * @module
 * The webhook retry sweep driven the way `npm run job` drives it: nothing registered by the
 * test, only what `prepareJob` installs from the job's own `needs`. With no broker the sweep sends
 * inline and can auto-disable a subscription; a declaration that forgets `subscriptions` disables
 * it and tells no staff.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { asRole, TEST_TENANT_ID } from '@tests/callers';
import { createUser } from '@modules/users/tests/factories';
import { notificationsService } from '@modules/notifications/services';
import { webhooksJobs } from '@modules/webhooks/jobs';
import {
    webhookDeliveryRepository,
    webhookSubscriptionRepository
} from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import {
    WEBHOOK_MAX_ATTEMPTS,
    WEBHOOK_MAX_CONSECUTIVE_FAILURES,
    WEBHOOK_MIN_FAILING_MS
} from '@modules/webhooks/domain';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerInScope } from '@kernel/permissions';
import { resetDomainEvents } from '@kernel/events';
import { prepareJob } from '../../scripts/ops/prepare-job';

// No broker: the sweep sends the row itself. The subscriber's endpoint always fails.
jest.mock('@infrastructure/adapters/queue', () => ({
    ...jest.requireActual('@infrastructure/adapters/queue'),
    publishToQueue: jest.fn().mockResolvedValue(false)
}));
jest.mock('@modules/webhooks/transport/webhook-delivery', () => ({
    ...jest.requireActual('@modules/webhooks/transport/webhook-delivery'),
    deliverWebhook: jest
        .fn()
        .mockResolvedValue({ success: false, durationMs: 5, error: 'HTTP 500' })
}));

setupTestDb();

// Reset the listeners so only the runner's own preparation can wire them.
beforeEach(() => resetDomainEvents());

afterEach(() => resetDomainEvents());

describe('the webhook retry sweep run through the job runner', () => {
    it('tells the staff when its inline send auto-disables a subscription', async () => {
        const [job] = webhooksJobs;
        const manager = await createUser(
            {
                email: 'manager@example.com',
                username: 'manager',
                authenticatorEnabledAt: new Date()
            },
            'manager'
        );
        const { entry } = mintRingSecret();
        // One failed chain short of the streak limit, the streak already old enough.
        const subscription = await webhookSubscriptionRepository.create({
            tenant: TEST_TENANT_ID,
            url: 'https://example.invalid/hook',
            eventTypes: ['*'],
            consecutiveFailures: WEBHOOK_MAX_CONSECUTIVE_FAILURES - 1,
            failingSince: new Date(Date.now() - (WEBHOOK_MIN_FAILING_MS + 60_000)),
            secrets: [entry]
        });
        // On its last attempt, so a failure exhausts the chain.
        await webhookDeliveryRepository.create({
            tenant: TEST_TENANT_ID,
            subscriptionId: subscription._id,
            eventId: 'evt_last',
            eventType: 'order.paid',
            payload: { orderId: 'order_1' },
            attempt: WEBHOOK_MAX_ATTEMPTS,
            status: 'pending',
            nextAttemptAt: new Date(Date.now() - 1000)
        });

        await prepareJob(job);
        await job.run();

        const { items } = await notificationsService.listVisible(
            callerInScope(
                { ...asRole('manager', manager.id), tenantId: DEPLOYMENT_TENANT_ID },
                'tenant'
            )
        );
        expect(items.map((item) => item.code)).toContain('notifications.staff.webhook-disabled');
    });
});
