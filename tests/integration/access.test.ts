/**
 * @module
 * The authorization model's STORAGE, against the in-memory Mongo `setupTestDb` wires up.
 *
 * The suite in `tests/cross-cutting/authorization-conformance.test.ts` proves the two backends
 * decide the same way. This one proves the thing those decisions are read FROM can be written,
 * edited and refused correctly, which is a different question.
 *
 * Every refusal here is an invariant somebody learned the expensive way. A model whose invariants
 * are documented is a model whose invariants drift: the check that is not executed is the check
 * that is not true.
 */

import { setupTestDb } from '@tests/setup-test-db';
import {
    AccessInvariantError,
    administratorsOf,
    assignRole,
    assignDefaultRole,
    bootstrapAccessModel,
    DEPLOYMENT_TENANT_SLUG,
    ensureTenant,
    membershipIn,
    membershipsOf,
    revokeRole,
    rolesOf
} from '@modules/access';
import { membershipModel } from '@modules/access/model';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import {
    SEED_OWNER_ID,
    SEED_USER_ID,
    SEED_EDITOR_ID,
    SEED_MODERATOR_ID,
    seedAccessModel
} from '@scenarios/accounts';
import { userRepository } from '@modules/users/tests/factories';
import { shopModules } from '@scenarios/index';
import { PERMISSION_KEYS, permissionsOfRole } from '@kernel/permissions';
import { asStub } from '@tests/stub';

setupTestDb();

/** The user rows the last describe compares against — seeded only where it needs them. */
const seedUsers = () => shopModules.users.seed();

describe('the preset roles', () => {
    // No seeding, no editing: a role's permissions live in `shared/authorization-roles.yaml`
    // alone — `kernel/permissions.ts` reads them at import, there is no database row to seed or
    // to edit. `tests/cross-cutting/authorization-conformance.test.ts` is where the YAML itself
    // gets exercised; this file is membership storage only.
    it('resolve straight from the shared file, with no database involved', () => {
        expect(permissionsOfRole('support')).toEqual(expect.any(Array));
    });
});

describe('membership across tenants', () => {
    it('lets one person hold a different role in each of two shops', async () => {
        // The requirement the boolean could not express, and the reason this collection exists.
        const north = await ensureTenant('north', 'North Shop');
        const south = await ensureTenant('south', 'South Shop');

        await assignRole('person-1', String(north._id), 'tenant', 'admin');
        await assignRole('person-1', String(south._id), 'tenant', 'warehouse');

        const held = await membershipsOf('person-1');

        expect(
            held
                .map((one) => ({ tenantId: one.tenantId, role: one.role }))
                .toSorted((a, b) => a.role.localeCompare(b.role))
        ).toEqual([
            { tenantId: String(north._id), role: 'admin' },
            { tenantId: String(south._id), role: 'warehouse' }
        ]);
    });

    it('holds one role per person per place, so a reassignment replaces rather than adds', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await assignRole('person-1', String(shop._id), 'tenant', 'customer');
        await assignRole('person-1', String(shop._id), 'tenant', 'manager');

        const held = await membershipsOf('person-1');

        // Two rows would not be a wider grant; they would be two answers to "what may they do
        // here", and the resolver would have to pick one.
        expect(held).toHaveLength(1);
        expect(held[0].role).toBe('manager');
    });

    it('separates the two scopes, so one person can run a shop and operate the installation', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await assignRole('person-1', String(shop._id), 'tenant', 'admin');
        await assignRole('person-1', null, 'platform', 'operator');

        const held = await membershipsOf('person-1');

        expect(held.map((one) => one.scope).toSorted()).toEqual(['platform', 'tenant']);
    });
});

describe('the invariants', () => {
    it('refuses a role nothing declares', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        // A member with a role nothing defines can do nothing and looks like a member who can.
        await expect(
            assignRole('person-1', String(shop._id), 'tenant', 'archivist')
        ).rejects.toThrow(AccessInvariantError);
    });

    it('refuses to grant what the granter does not hold', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        // The single most common way these systems fail: a role editor that lets a support agent
        // hand somebody the keys they do not have themselves.
        await expect(
            assignRole('person-1', String(shop._id), 'tenant', 'admin', ['feedback.any.read'])
        ).rejects.toThrow(/privilege-escalation/);
    });

    it('allows a granter to hand over exactly what they hold', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        // A role's keys are a pure YAML lookup now — no membership or tenant involved in reading
        // what `admin` holds, only in who holds it.
        const granter = permissionsOfRole('admin');

        await expect(
            assignRole('person-1', String(shop._id), 'tenant', 'manager', granter)
        ).resolves.toBeDefined();
    });

    it('refuses to remove the last member who can administer a shop', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('only-owner', String(shop._id), 'tenant', 'admin');

        // Without this a shop becomes unadministrable and only somebody with a database client
        // can put it right.
        await expect(revokeRole('only-owner', String(shop._id), 'tenant')).rejects.toThrow(
            /only member who can administer/
        );
    });

    it('puts the membership back after refusing, not just the error', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('only-owner', String(shop._id), 'tenant', 'admin');

        // The refusal deletes first and restores second (no replica set to run a transaction
        // against in dev/test — see the docblock on `revokeRole`). This is what proves the
        // restore actually lands, not only that the promise rejects.
        await expect(revokeRole('only-owner', String(shop._id), 'tenant')).rejects.toThrow(
            AccessInvariantError
        );
        expect(await administratorsOf(String(shop._id), 'tenant')).toEqual(['only-owner']);
    });

    it('surfaces a rejecting delete instead of losing it silently', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('owner-a', String(shop._id), 'tenant', 'admin');
        await assignRole('owner-b', String(shop._id), 'tenant', 'admin');
        const failure = new Error('mongo is down');
        const spy = jest.spyOn(membershipModel, 'deleteOne').mockReturnValue(
            asStub<ReturnType<typeof membershipModel.deleteOne>>({
                exec: () => Promise.reject(failure)
            })
        );

        // Before this fix the delete was fired with `void` and never awaited — a rejection here
        // vanished as an unhandled rejection instead of reaching the caller.
        await expect(revokeRole('owner-a', String(shop._id), 'tenant')).rejects.toThrow(
            'mongo is down'
        );

        spy.mockRestore();
    });

    it('cannot leave zero administrators from two concurrent last-two revokes', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('owner-a', String(shop._id), 'tenant', 'admin');
        await assignRole('owner-b', String(shop._id), 'tenant', 'admin');

        // No transaction to serialize these — both deletes can land before either checks. The
        // guarantee this shape buys is weaker than a transaction's (a genuine tie can refuse
        // both instead of letting one through), but the one thing it must never do is let both
        // succeed and leave the shop with nobody who can administer it.
        const outcomes = await Promise.allSettled([
            revokeRole('owner-a', String(shop._id), 'tenant'),
            revokeRole('owner-b', String(shop._id), 'tenant')
        ]);

        expect(outcomes.filter((outcome) => outcome.status === 'fulfilled').length).toBeLessThan(2);
        expect(await administratorsOf(String(shop._id), 'tenant')).not.toEqual([]);
    });

    it('allows removing an administrator once another one exists', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('owner-a', String(shop._id), 'tenant', 'admin');
        await assignRole('owner-b', String(shop._id), 'tenant', 'admin');

        await revokeRole('owner-a', String(shop._id), 'tenant');

        expect(await administratorsOf(String(shop._id), 'tenant')).toEqual(['owner-b']);
    });

    it('counts administrators by what they HOLD, computed against the shared presets', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        const everyTenantKey = PERMISSION_KEYS.filter((key) => key.scope === 'tenant').map(
            (key) => key.key
        );
        // `admin` is the only preset that holds every tenant key (Phase 2.2) — proving the
        // invariant asks the YAML, not a hand-picked name, by checking that fact rather than
        // assuming it.
        expect(permissionsOfRole('admin')).toEqual(expect.arrayContaining(everyTenantKey));
        await assignRole('person-1', String(shop._id), 'tenant', 'admin');

        expect(await administratorsOf(String(shop._id), 'tenant')).toEqual(['person-1']);
    });

    // `deleteRole` and the editable per-tenant role it operated on are gone — presets are the
    // sole authority now, defined in `shared/authorization-roles.yaml` alone, and nothing
    // deletes a preset at runtime.
});

describe('bootstrapAccessModel', () => {
    it('creates the shop, with no accounts — the presets need no seeding step', async () => {
        const tenant = await bootstrapAccessModel('Shop');

        expect(tenant.slug).toBe(DEPLOYMENT_TENANT_SLUG);
        expect(await membershipsOf(SEED_OWNER_ID)).toEqual([]);
    });

    it('is idempotent, and keeps the id a first insert set', async () => {
        const first = await bootstrapAccessModel('Shop');
        const second = await bootstrapAccessModel('A different name');

        expect(String(second._id)).toBe(String(first._id));
        expect(second.name).toBe('Shop');
    });
});

describe('the seeded model', () => {
    it('places the demo accounts, and gives root both jobs', async () => {
        await seedAccessModel();

        const rootMemberships = await membershipsOf(SEED_OWNER_ID);

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

        expect(await membershipsOf(SEED_OWNER_ID)).toHaveLength(2);
    });

    it('is the ONLY place a role is stored — the user document carries none', async () => {
        await seedUsers();
        await seedAccessModel();

        const membership = await membershipIn(SEED_OWNER_ID, DEPLOYMENT_TENANT_ID, 'tenant');
        const published = await userRepository.findById(SEED_OWNER_ID);

        /*
         * One store, one answer — the redundancy this phase closed. A role field on the user
         * document could drift from the membership that actually decides authorization; the fix
         * is not to keep them in sync, it is to have only one of them at all.
         */
        expect(membership?.role).toBe('admin');
        expect(asStub<{ role?: unknown }>(published).role).toBeUndefined();
    });
});

describe('a role lives in exactly one place, the membership row', () => {
    it('an account with no membership resolves to no role, not a guess', async () => {
        // `ensureTenant` alone, no `assignRole` — nobody has ever been placed here.
        const shop = await ensureTenant('nomembers', 'No Members Shop');

        const roles = await rolesOf('never-granted', String(shop._id));

        expect(roles.tenant).toBeNull();
        expect(roles.platform).toBeNull();
    });

    it('assignDefaultRole can only ever grant unverified — there is no name to pass it', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await assignDefaultRole('fresh-signup', String(shop._id));

        const membership = await membershipIn('fresh-signup', String(shop._id), 'tenant');
        expect(membership?.role).toBe('unverified');
        // The type itself is the guard: `assignDefaultRole` takes no role-name parameter at all,
        // so a caller cannot express "grant admin" through it even by mistake — see
        // `@modules/access`'s `service.ts`.
    });

    it('assignRole refuses a name the shared presets do not declare', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await expect(
            assignRole('person-1', String(shop._id), 'tenant', 'not-a-real-role')
        ).rejects.toThrow(AccessInvariantError);
    });
});
