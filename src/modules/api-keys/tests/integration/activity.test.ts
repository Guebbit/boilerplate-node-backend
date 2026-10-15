/**
 * @module
 * Using an API key is proof of life for the account that minted it: the inactivity reaper reads
 * `lastApiKeyUseAt`, so a key-only account is never mistaken for an idle one.
 */

import { eventually } from '@tests/eventually';
import { setupTestDb } from '@tests/setup-test-db';
import apiKeysModule from '@modules/api-keys/module';
import { mint } from '@modules/api-keys/services/api-keys';
import { createUser, userRepository } from '@modules/users/tests/factories';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { resolveCredential } from '@kernel/authentication';
import { permissionsOfRole } from '@kernel/permissions';
import type { TenantCallerContext } from '@types';

setupTestDb();

// Installs the credential resolver, as a real boot does once the module is enabled.
apiKeysModule.onRegistered?.();

/** The stamp on the account, read straight from the collection. */
const stampOf = (id: string) => userRepository.findById(id).then((user) => user?.lastApiKeyUseAt);

describe('an api key in use', () => {
    it('stamps its minter as active', async () => {
        const user = await createUser({ verifiedAt: new Date() }, 'admin');
        const context: TenantCallerContext = {
            caller: {
                id: user.id,
                tenantId: DEPLOYMENT_TENANT_ID,
                scope: 'tenant',
                permissions: permissionsOfRole('admin'),
                unrestricted: false,
                system: false
            },
            analyticsConsent: false
        };
        const minted = await mint(
            {
                name: 'ci',
                permissions: ['read:WebhookSubscription'],
                expiresAt: new Date(Date.now() + 7 * 24 * 3_600_000).toISOString()
            },
            context
        );
        expect(await stampOf(user.id)).toBeUndefined();

        const resolution = await resolveCredential(minted.data?.secret ?? '');

        expect(resolution).toHaveProperty('ok');
        // The stamp is fire-and-forget: give the write a moment to land.
        let stamp: Date | undefined;
        await eventually(() => {
            void stampOf(user.id).then((value) => {
                stamp = value;
            });
            return stamp !== undefined;
        });
        expect(stamp).toBeInstanceOf(Date);
    });
});
