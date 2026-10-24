/**
 * What an erased staff member leaves behind: the integration they configured, the translation they
 * typed and the purchase hold they placed on a buyer all keep working, with the person's id
 * unset. Same rule as the order timeline's actor. Runs the real cascade through the purge door.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerCheckoutModules } from '@tests/checkout-modules';
import { TEST_TENANT_ID } from '@tests/callers';
import { resetDomainEvents } from '@kernel/events';
import webhooksModule from '@modules/webhooks/module';
import localesModule from '@modules/locales/module';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import { translationRepository } from '@modules/locales/repository';
import { TranslationOrigin } from '@types';
import { createUser, eraseAsScheduled, userRepository } from '@modules/users/tests/factories';

setupTestDb();

beforeEach(() => {
    registerCheckoutModules([webhooksModule, localesModule]);
});

afterEach(() => resetDomainEvents());

describe('erasing a staff account', () => {
    it('leaves its webhook subscription in place, with no owner', async () => {
        const staff = await createUser({ email: 'ops@example.com' }, 'manager');
        const subscription = await webhookSubscriptionRepository.create({
            tenant: TEST_TENANT_ID,
            url: 'https://hooks.example.com/ops',
            eventTypes: ['*'],
            ownerUserId: staff.id,
            secrets: [mintRingSecret().entry]
        });

        await eraseAsScheduled(staff);

        const kept = await webhookSubscriptionRepository.findById(String(subscription._id));
        expect(kept).not.toBeNull();
        expect(kept?.ownerUserId).toBeUndefined();
    });

    it('leaves the translation it typed in place, with no translator', async () => {
        const staff = await createUser({ email: 'translator@example.com' }, 'manager');
        const row = await translationRepository.upsertEntityLocale(
            'product',
            'p1',
            'en',
            { title: 'Hello' },
            TranslationOrigin.human,
            staff.id,
            undefined
        );

        await eraseAsScheduled(staff);

        const kept = await translationRepository.findById(String(row._id));
        expect(kept?.fields).toEqual({ title: 'Hello' });
        expect(kept?.translatedBy).toBeUndefined();
    });

    it('leaves the hold it placed on a buyer in force, without the name', async () => {
        const staff = await createUser({ email: 'moderator@example.com' }, 'manager');
        const buyer = await createUser({
            email: 'buyer@example.com',
            purchaseHold: {
                until: new Date(Date.now() + 86_400_000),
                reason: 'staff',
                setBy: staff.id,
                setAt: new Date()
            }
        });

        await eraseAsScheduled(staff);

        const kept = await userRepository.findById(buyer.id);
        expect(kept?.purchaseHold?.reason).toBe('staff');
        expect(kept?.purchaseHold?.setBy).toBeUndefined();
    });
});
