/**
 * @module
 * The demo seed's authorization side, and the cross-module invariant it depends on: a role lives
 * in the membership row alone, never mirrored onto the user document `@modules/users` owns.
 *
 * The access module's own writers — `assignRole`, `revokeRole`, the invariants they enforce, the
 * audit trail — are exercised in `src/modules/access/tests/integration/access.test.ts`, alongside
 * that module. This file is what is left once module-scoped storage moves there: a system rule
 * that spans two modules plus the demo scenario that seeds both.
 */

import { setupTestDb } from '@tests/setup-test-db';
import { membershipIn, membershipsOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import {
    SEED_ADMIN_ID,
    SEED_USER_ID,
    SEED_EDITOR_ID,
    SEED_MODERATOR_ID,
    seedAccessModel
} from '@scenarios/accounts';
import { userRepository } from '@modules/users/tests/factories';
import { shopModules } from '@scenarios/index';
import { asStub } from '@tests/stub';

setupTestDb();

/** The user rows the last case compares against — seeded only where it needs them. */
const seedUsers = () => shopModules.users.seed();

describe('the seeded model', () => {
    it('places the demo accounts, and gives root both jobs', async () => {
        await seedAccessModel();

        const rootMemberships = await membershipsOf(SEED_ADMIN_ID);

        // Two memberships for one person, because running a shop and operating the installation
        // are two jobs. Which one a request acts as is settled by the key it asks about — this is
        // the account everybody logs in as, so the split is exercised by the demo itself.
        expect(
            rootMemberships
                .map((one) => ({ scope: one.scope, role: one.role }))
                .toSorted((a, b) => a.scope.localeCompare(b.scope))
        ).toEqual([
            { scope: 'platform', role: 'operator' },
            { scope: 'tenant', role: 'admin' }
        ]);

        const [customer, editor, moderator] = await Promise.all([
            membershipIn(SEED_USER_ID, DEPLOYMENT_TENANT_ID, 'tenant'),
            membershipIn(SEED_EDITOR_ID, DEPLOYMENT_TENANT_ID, 'tenant'),
            membershipIn(SEED_MODERATOR_ID, DEPLOYMENT_TENANT_ID, 'tenant')
        ]);

        // Each of these two holds exactly one tenant role, unlike root's two jobs above — the
        // whole point of adding them is a staff account that can be logged into on its own.
        expect(customer?.role).toBe('customer');
        expect(editor?.role).toBe('editor');
        expect(moderator?.role).toBe('moderator');
    });

    it('is idempotent, so a re-seed of a live database changes nothing', async () => {
        await seedAccessModel();
        await seedAccessModel();

        expect(await membershipsOf(SEED_ADMIN_ID)).toHaveLength(2);
    });

    it('is the ONLY place a role is stored — the user document carries none', async () => {
        await seedUsers();
        await seedAccessModel();

        const membership = await membershipIn(SEED_ADMIN_ID, DEPLOYMENT_TENANT_ID, 'tenant');
        const published = await userRepository.findById(SEED_ADMIN_ID);

        /*
         * One store, one answer — the redundancy this phase closed. A role field on the user
         * document could drift from the membership that actually decides authorization; the fix
         * is not to keep them in sync, it is to have only one of them at all.
         */
        expect(membership?.role).toBe('admin');
        expect(asStub<{ role?: unknown }>(published).role).toBeUndefined();
    });
});
