// requires-module: example
/**
 * @module
 * A public event (`x-read-rule: public`) is the one a caller with no account rule may subscribe
 * to. The `example` module declares the only one, so these cases go with it: the read-rule cases
 * in `event-read-rule.test.ts` and `catalog.test.ts` run on the account events alone.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { callerAs } from '@tests/callers';
import { create, update } from '../../services/subscriptions';
import { listWebhookEventCatalog, registerWebhookCatalog } from '../../services/catalog';
import { webhookSubscriptionRepository } from '../../repository';

setupTestDb();

beforeAll(() => {
    registerWebhookCatalog(['users', 'example']);
});

afterAll(() => {
    registerWebhookCatalog([]);
});

/** The manager writes subscriptions but reads no accounts. */
const asManager = { caller: callerAs('manager'), analyticsConsent: false };

/** An admin caller, without analytics consent. */
const asAdmin = { caller: callerAs('admin'), analyticsConsent: false };

describe('a public event', () => {
    it('is flagged subscribable for a caller who reads no accounts', () => {
        const flags = Object.fromEntries(
            listWebhookEventCatalog(callerAs('manager')).map((e) => [e.name, e.actions.subscribe])
        );

        expect(flags).toMatchObject({ 'example.published': true, 'user.updated': false });
    });

    it('lets a manager subscribe to it', async () => {
        const result = await create(
            { url: 'https://hooks.example.com/a', eventTypes: ['example.published'] },
            asManager
        );

        expect(result).toMatchObject({ success: true, status: 201 });
    });

    it('does not let a manager narrow an admin’s `*` stream and redirect it in one call', async () => {
        const created = await create(
            { url: 'https://hooks.example.com/admin', eventTypes: ['*'] },
            asAdmin
        );
        if (!created.success || !created.data) throw new Error('setup failed: create was refused');
        const { subscription } = created.data;

        const result = await update(
            String(subscription._id),
            { eventTypes: ['example.published'], url: 'https://evil.example.com/hook' },
            asManager
        );

        expect(result).toMatchObject({
            success: false,
            errors: [{ code: 'WEBHOOK_EVENT_READ_REQUIRED' }]
        });
        const row = await webhookSubscriptionRepository.findById(String(subscription._id));
        expect(row?.eventTypes).toEqual(['*']);
    });
});
