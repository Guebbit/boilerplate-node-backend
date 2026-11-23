/**
 * @module
 * The user's ask, for everything that is not the shop: after a scheduled self-deletion has run, no
 * collection still names the account except the ones the law lets the app keep. The shop's half —
 * and the hard delete of an account that has bought — is `tests/integration/erasure-shop.test.ts`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { registerModules } from '@kernel/registry';
import { resetDomainEvents } from '@kernel/events';
import { testCallerContext, TEST_TENANT_ID } from '@tests/callers';
import { collectionsNaming, KEPT_BY_LAW } from '@tests/erasure-sweep';
import accessModule from '@modules/access/module';
import accountModule from '@modules/account/module';
import addressesModule from '@modules/addresses/module';
import apiKeysModule from '@modules/api-keys/module';
import exampleModule from '@modules/example/module';
import localesModule from '@modules/locales/module';
import notificationsModule from '@modules/notifications/module';
import tasksModule from '@modules/tasks/module';
import usersModule from '@modules/users/module';
import webhooksModule from '@modules/webhooks/module';
import { TranslationOrigin } from '@types';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { giveAddress } from '@modules/addresses/tests/factories';
import { taskModel } from '@modules/tasks/model';
import { accountService } from '@modules/account/services';
import { plantSession, plantToken } from '@modules/account/tests/factories';
import { createNotification } from '@modules/notifications/tests/factories';
import { createExample } from '@modules/example/tests/factories';
import { webhookSubscriptionRepository } from '@modules/webhooks/repository';
import { mintRingSecret } from '@modules/webhooks/secrets';
import { mint } from '@modules/api-keys/services/api-keys';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { permissionsOfRole } from '@kernel/permissions';
import { translationRepository } from '@modules/locales/repository';

setupTestDb();

beforeEach(() => {
    registerModules([
        accountModule,
        usersModule,
        addressesModule,
        tasksModule,
        webhooksModule,
        localesModule,
        notificationsModule,
        exampleModule,
        accessModule,
        apiKeysModule
    ]);
});

afterEach(() => resetDomainEvents());

describe('a scheduled self-deletion that has run', () => {
    it('leaves no collection naming the account, except the ones the law keeps', async () => {
        const email = 'full-life@example.com';
        const user = await createUser({ email, verifiedAt: new Date() }, 'support');
        await giveAddress(user.id);
        await createNotification({ userId: user.id });
        await plantSession(user.id, 'a-session');
        await plantToken(user.id, 'password', 'a-reset-link');
        const example = await createExample({ userId: user.id });
        await mint(
            {
                name: 'ci',
                permissions: ['read:WebhookSubscription'],
                expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString()
            },
            {
                caller: {
                    id: user.id,
                    tenantId: DEPLOYMENT_TENANT_ID,
                    scope: 'tenant',
                    permissions: permissionsOfRole('admin'),
                    unrestricted: false,
                    system: false
                },
                analyticsConsent: false
            }
        );
        await webhookSubscriptionRepository.create({
            tenant: TEST_TENANT_ID,
            url: 'https://hooks.example.com/full-life',
            eventTypes: ['*'],
            ownerUserId: user.id,
            secrets: [mintRingSecret().entry]
        });
        await translationRepository.upsertEntityLocale(
            'example',
            String(example._id),
            'en',
            { title: 'Sample' },
            TranslationOrigin.human,
            user.id,
            undefined
        );
        await createUser({
            email: 'other-buyer@example.com',
            purchaseHold: {
                until: new Date(Date.now() + 86_400_000),
                reason: 'staff',
                setBy: user.id,
                setAt: new Date()
            }
        });
        await taskModel.create({ email, subject: 'Hello', message: 'A question' });
        /**
         * The seeds landed: every home below names the account before the purge, so an empty
         * answer afterwards means the cascade worked, not that nothing was ever written.
         */
        expect(await collectionsNaming([user.id.toLowerCase(), email])).toEqual(
            expect.arrayContaining([
                'addressbooks',
                'apikeys',
                'examples',
                'memberships',
                'notifications',
                'sessions',
                'tasks',
                'translations',
                'verificationtokens',
                'webhooksubscriptions'
            ])
        );
        const loaded = await userRepository.findById(user.id);
        await accountService.scheduleAccountDeletion(loaded!, testCallerContext);
        // The lock is reversible, so a restore must find the message: it goes at the purge only.
        expect(await taskModel.countDocuments({ email })).toBe(1);
        // The app clock reaches the date: the grace is the only thing that decides when.
        await userRepository.updateMany(
            { _id: user.id },
            { $set: { purgeAt: new Date(Date.now() - 1000) } }
        );

        const purged = await accountService.purgeScheduledDeletions();

        expect(purged.purged).toBe(1);
        expect(await userRepository.findById(user.id)).toBeNull();
        const named = await collectionsNaming([user.id.toLowerCase(), email]);
        expect(named.filter((name) => !(name in KEPT_BY_LAW))).toEqual([]);
    });
});
