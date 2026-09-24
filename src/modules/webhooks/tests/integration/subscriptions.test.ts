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
import { createUser } from '@modules/users/tests/factories';

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

describe('create — captures the owner id', () => {
    it("stores the creating caller's id, off the wire, for the auto-disable notice", async () => {
        const user = await createUser({ email: 'creator@example.com' });
        const asUser = { caller: callerAs('manager', String(user._id)), analyticsConsent: false };

        const result = await create(subscriptionBody('https://example.com/owner-hook'), asUser);

        expect(result.success).toBe(true);
        if (!result.success || !result.data) throw new Error('unreachable — asserted above');
        // Never on the wire — `applyWebhookSubscriptionTransform` omits it (see `../../model.ts`).
        expect(
            (result.data.subscription.toJSON() as { ownerUserId?: string }).ownerUserId
        ).toBeUndefined();

        const stored = await webhookSubscriptionRepository.findById(
            String(result.data.subscription._id)
        );
        expect(stored?.ownerUserId).toBe(String(user._id));
    });

    it('stores whatever id the caller carries, unresolved — no lookup happens at creation', async () => {
        // `callerAs('manager')`'s default id ('test-user') is not a real ObjectId — the shape a
        // stub/anonymous caller would have, never a real authenticated one in production. Under the
        // pointer design this is harmless either way: creation never resolves it, only
        // `services/attempt.ts`'s auto-disable notice does, lazily, at send time.
        const asStubCaller = { caller: callerAs('manager'), analyticsConsent: false };

        const result = await create(
            subscriptionBody('https://example.com/no-owner-hook'),
            asStubCaller
        );

        expect(result.success).toBe(true);
        if (!result.success || !result.data) throw new Error('unreachable — asserted above');
        const stored = await webhookSubscriptionRepository.findById(
            String(result.data.subscription._id)
        );
        expect(stored?.ownerUserId).toBe('test-user');
    });
});
