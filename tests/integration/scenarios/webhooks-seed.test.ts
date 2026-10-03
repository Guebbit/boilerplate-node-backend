/**
 * @module
 * The demo's seeded webhook subscription (`scenarios/webhooks.ts`) is an ordinary, editable one.
 *
 * Every webhook URL is `https://`, the demo's included, so the row the seeder writes straight to
 * the database must be one the contract's own edit body accepts and the service saves — a record
 * its own form cannot save is the failure this guards. The sink host stays exempt from the
 * private-address check only, which is why a loopback `https://` URL passes here at all.
 */

import { UpdateWebhookSubscriptionBody } from '@api/schemas.zod';
import { setupTestDb } from '@tests/setup-test-db';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { callerAs } from '@tests/callers';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { update } from '@modules/webhooks/services/subscriptions';
import { seedWebhooksCollection } from '@scenarios/webhooks';
import { setEnvironment } from '@tests/environment';

setupTestDb();

/** The sink's address as the live recipe and `.env-example` give it. */
const SINK_URL = 'https://127.0.0.1:3070';

/** What a manager's edit request runs as, in the tenant the seeder writes into. */
const context = {
    caller: { ...callerAs('manager'), tenantId: DEPLOYMENT_TENANT_ID },
    analyticsConsent: false
};

beforeEach(() => {
    setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: SINK_URL });
});

/** Seed, then read the one subscription it wrote. */
const seededSubscription = () =>
    seedWebhooksCollection()
        .then(() => webhookSubscriptionRepository.search({}, {}, { _id: 1 }))
        .then(({ items }) => {
            const [subscription] = items;
            if (!subscription) throw new Error('the seeder wrote no subscription');
            return subscription;
        });

describe('seedWebhooksCollection', () => {
    it('seeds nothing while no sink is configured', async () => {
        setEnvironment({ NODE_WEBHOOK_DEMO_SINK_URL: undefined });

        await expect(seedWebhooksCollection()).resolves.toEqual([]);
    });

    it('points the subscription at the sink over https', async () => {
        const subscription = await seededSubscription();

        expect(subscription.url).toMatch(/^https:\/\/127\.0\.0\.1:3070\/[\da-f-]{36}$/);
    });

    it("writes a URL the contract's edit body accepts", async () => {
        const subscription = await seededSubscription();

        const body = UpdateWebhookSubscriptionBody.safeParse({
            url: subscription.url,
            description: 'edited in the form'
        });

        expect(body.success).toBe(true);
    });

    it('saves an edit that moves the URL on the sink host', async () => {
        const subscription = await seededSubscription();

        const result = await update(
            subscription.id,
            { url: `${SINK_URL}/another-session` },
            context
        );

        expect(result.success).toBe(true);
    });
});
