/**
 * The subscription cap's race guard: `services/subscriptions.ts`'s `create` checks the tenant's
 * count once before inserting, then re-checks by insertion rank after — this suite is the second
 * check's own reason to exist, since a mocked repository can't reproduce two writers actually
 * landing at the same instant.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { create } from '@modules/webhooks/services/subscriptions';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { callerAs, TEST_TENANT_ID } from '@tests/callers';

setupTestDb();

const context = { caller: callerAs('manager'), analyticsConsent: false };

const subscriptionBody = (url: string) => ({
    url,
    eventTypes: ['*']
});

describe('create — the subscription cap boundary', () => {
    const originalCap = process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP;

    beforeEach(() => {
        process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP = '1';
    });

    afterEach(() => {
        if (originalCap === undefined) delete process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP;
        else process.env.NODE_WEBHOOK_SUBSCRIPTION_CAP = originalCap;
    });

    it('two truly concurrent creates at the cap cannot both succeed', async () => {
        const [first, second] = await Promise.all([
            create(subscriptionBody('https://example.com/hook-a'), context),
            create(subscriptionBody('https://example.com/hook-b'), context)
        ]);

        const outcomes = [first, second];
        const succeeded = outcomes.filter((outcome) => outcome.success);
        const rejected = outcomes.filter((outcome) => !outcome.success);

        // Exactly one of the two racing calls gets the single slot the cap of 1 allows — the
        // count-then-insert pre-check alone would let both through, since both read the same `0`.
        expect(succeeded).toHaveLength(1);
        expect(rejected).toHaveLength(1);
        expect(rejected[0]?.success).toBe(false);
        if (rejected[0]?.success) throw new Error('unreachable — asserted above');
        expect(rejected[0].status).toBe(422);

        // The loser's row does not linger — the rollback that closes the race actually deletes it.
        const stored = await webhookSubscriptionRepository.search(
            {},
            { tenant: TEST_TENANT_ID },
            {
                createdAt: -1,
                _id: -1
            }
        );
        expect(stored.items).toHaveLength(1);
    });
});
