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
    deleteRole,
    ensureTenant,
    membershipIn,
    membershipsOf,
    permissionsOfMembership,
    revokeRole,
    roleFor,
    tenantBySlug
} from '@kernel/access/store';
import { membershipModel, roleModel } from '@kernel/access/models';
import { bootstrapAccessModel, DEPLOYMENT_TENANT_SLUG, seedPresetRoles } from '@kernel/access/seed';
import {
    SEED_OWNER_ID,
    SEED_USER_ID,
    SEED_EDITOR_ID,
    SEED_MODERATOR_ID,
    seedAccessModel
} from '@scenarios/accounts';
import { userRepository } from '@modules/users/tests/factories';
import { shopModules } from '@scenarios/index';
import { PRESET_ROLES, wildcardKeyFor } from '@kernel/permissions';
import { asStub } from '@tests/stub';

setupTestDb();

beforeEach(async () => {
    await seedPresetRoles();
});

/** The user rows the last describe compares against — seeded only where it needs them. */
const seedUsers = () => shopModules.users.seed();

describe('the preset roles', () => {
    it('are seeded as editable rows, one per name', async () => {
        const stored = await roleModel.find({ preset: true }).exec();

        // Every preset in the shared file, and nothing invented here: the seeder reads that file
        // rather than restating it, which is what makes both backends start the same shop.
        expect(stored.map((role) => role.name).toSorted()).toEqual(
            [...PRESET_ROLES.map((role) => role.name), 'guest'].toSorted()
        );
    });

    it('are idempotent, so seeding a seeded database changes nothing', async () => {
        await seedPresetRoles();

        expect(await roleModel.countDocuments({ name: 'admin' }).exec()).toBe(1);
    });

    it('can be edited, because roles are data', async () => {
        await roleModel.updateOne(
            { name: 'support', tenantId: null },
            { $set: { permissions: [] } }
        );

        const support = await roleFor('support', 'tenant', null);

        expect(support?.permissions).toEqual([]);
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

    it('resolves each membership to its own keys, not to a union of them', async () => {
        const north = await ensureTenant('north', 'North Shop');
        const south = await ensureTenant('south', 'South Shop');

        const [inNorth, inSouth] = await Promise.all([
            permissionsOfMembership({
                role: 'admin',
                scope: 'tenant',
                tenantId: String(north._id)
            }),
            permissionsOfMembership({
                role: 'warehouse',
                scope: 'tenant',
                tenantId: String(south._id)
            })
        ]);

        // Owning one shop says nothing about the other. If these merged, "a member of several
        // associations with different roles in each" would mean the widest role everywhere.
        expect(inNorth).toContain(wildcardKeyFor('tenant'));
        expect(inSouth).not.toContain(wildcardKeyFor('tenant'));
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

    it('prefers a shop own role over the preset of the same name', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await roleModel.create({
            name: 'manager',
            scope: 'tenant',
            tenantId: String(shop._id),
            permissions: ['products.self.read'],
            preset: false
        });

        // What "a deployment may edit its roles" means in practice: this shop's manager is
        // narrower, and every other shop still gets the preset.
        const scoped = await roleFor('manager', 'tenant', String(shop._id));

        expect(scoped?.permissions).toEqual(['products.self.read']);
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
        const granter = await permissionsOfMembership({
            role: 'admin',
            scope: 'tenant',
            tenantId: String(shop._id)
        });

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

    it('counts administrators by what they HOLD, not by what they are called', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await roleModel.create({
            name: 'steward',
            scope: 'tenant',
            tenantId: String(shop._id),
            permissions: [wildcardKeyFor('tenant')],
            preset: false
        });
        await assignRole('person-1', String(shop._id), 'tenant', 'steward');

        // A deployment may rename or invent roles. The invariant has to survive that, so it asks
        // which rows hold the wildcard rather than which rows are called `owner`.
        expect(await administratorsOf(String(shop._id), 'tenant')).toEqual(['person-1']);
    });

    it('refuses to delete a preset every shop starts with', async () => {
        await expect(deleteRole('manager', 'tenant', null, 'customer')).rejects.toThrow(/preset/);
    });

    it('moves a deleted role members to a named role rather than to nothing', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await roleModel.create({
            name: 'curator',
            scope: 'tenant',
            tenantId: String(shop._id),
            permissions: ['products.self.read'],
            preset: false
        });
        await assignRole('person-1', String(shop._id), 'tenant', 'curator');

        const moved = await deleteRole('curator', 'tenant', String(shop._id), 'customer');

        // Never silently to "no permissions", never silently to a default: the reassignment is a
        // required argument, so the caller has to have decided.
        expect(moved).toBe(1);
        const moved2 = await membershipsOf('person-1');

        expect(moved2[0].role).toBe('customer');
    });

    it('refuses a deletion whose reassignment target does not exist', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await roleModel.create({
            name: 'curator',
            scope: 'tenant',
            tenantId: String(shop._id),
            permissions: [],
            preset: false
        });

        await expect(deleteRole('curator', 'tenant', String(shop._id), 'nobody')).rejects.toThrow(
            /no such role/
        );
    });
});

describe('bootstrapAccessModel', () => {
    it('creates the shop and the presets, with no accounts', async () => {
        const tenant = await bootstrapAccessModel('Shop');

        expect(tenant.slug).toBe(DEPLOYMENT_TENANT_SLUG);
        expect(await roleModel.countDocuments({ preset: true })).toBe(PRESET_ROLES.length + 1);
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

        const tenant = await tenantBySlug(DEPLOYMENT_TENANT_SLUG);
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
            membershipIn(SEED_USER_ID, String(tenant?._id), 'tenant'),
            membershipIn(SEED_EDITOR_ID, String(tenant?._id), 'tenant'),
            membershipIn(SEED_MODERATOR_ID, String(tenant?._id), 'tenant')
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

    it('agrees with what the users module publishes', async () => {
        await seedUsers();
        await seedAccessModel();

        const tenant = await tenantBySlug(DEPLOYMENT_TENANT_SLUG);
        const [membership, published] = await Promise.all([
            membershipIn(SEED_OWNER_ID, String(tenant?._id), 'tenant'),
            userRepository.findById(SEED_OWNER_ID)
        ]);

        /*
         * Two stores, one answer. The membership is what authorization is decided from; the user
         * row's `role` is what the staff list shows. They are written by one caller apiece and
         * this is what refuses to let them drift — a listing that disagrees with the model is a
         * listing that lies, and nobody finds out until somebody cannot do their job.
         */
        expect(published?.role).toBe(membership?.role);
    });
});
