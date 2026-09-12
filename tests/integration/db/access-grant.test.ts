/**
 * `access:grant` — the console command a fresh deployment uses to create its first owner.
 *
 * Exercises `grantAccess` directly, not the CLI wrapper: `grant-access.ts` parses `process.argv`
 * and connects on import, which a test cannot drive per case — same reasoning as
 * `tests/integration/db/index-sync.test.ts`.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { createUser } from '@modules/users/tests/factories';
import { membershipIn } from '@kernel/access/store';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { grantAccess, GrantAccessError } from '../../../db/access-grant';

setupTestDb();

describe('grantAccess', () => {
    it("grants a shop role to an existing account's tenant scope", async () => {
        const user = await createUser({ email: 'owner@example.com' });

        await grantAccess('owner@example.com', 'owner', 'tenant');

        const membership = await membershipIn(user.id, DEPLOYMENT_TENANT_ID, 'tenant');
        expect(membership?.role).toBe('owner');
    });

    it('grants a platform role with no shop, tenant-less by definition', async () => {
        const user = await createUser({ email: 'operator@example.com' });

        await grantAccess('operator@example.com', 'operator', 'platform');

        const membership = await membershipIn(user.id, null, 'platform');
        expect(membership?.role).toBe('operator');
    });

    it('refuses an email nobody signed up with', async () => {
        await expect(grantAccess('nobody@example.com', 'owner', 'tenant')).rejects.toThrow(
            GrantAccessError
        );
    });

    it("refuses a role no module declares — assignRole's own invariant, not this script's", async () => {
        await createUser({ email: 'someone@example.com' });

        await expect(
            grantAccess('someone@example.com', 'not-a-real-role', 'tenant')
        ).rejects.toThrow(/is not a role/);
    });
});
