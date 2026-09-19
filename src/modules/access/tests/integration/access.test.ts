/**
 * @module
 * The authorization model's STORAGE, against the in-memory Mongo `setupTestDb` wires up — the
 * module's own writers (`../../service.ts`, `../../repository.ts`) and the invariants they enforce.
 *
 * The suite in `tests/cross-cutting/authorization-conformance.test.ts` proves the two backends
 * decide the same way. This one proves the thing those decisions are read FROM can be written,
 * edited and refused correctly, which is a different question. `tests/integration/access.test.ts`
 * is the system-level companion: seeding the full demo model and the cross-module invariant that a
 * role lives nowhere but this collection.
 *
 * Every refusal here is an invariant somebody learned the expensive way. A model whose invariants
 * are documented is a model whose invariants drift: the check that is not executed is the check
 * that is not true.
 */

import { setupTestDb } from '@tests/setup-test-db';
import {
    AccessInvariantError,
    administratorsOf,
    assertCanGrant,
    assignRole,
    assignDefaultRole,
    bootstrapAccessModel,
    DEPLOYMENT_TENANT_SLUG,
    ensureTenant,
    membershipIn,
    membershipsOf,
    revokeAllOf,
    revokeRole,
    rolesOf,
    rolesOfMany
} from '../../service';
import { membershipRepository } from '../../repository';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { PERMISSION_KEYS, permissionsOfRole } from '@kernel/permissions';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { testCallerContext } from '@tests/caller-context';
import { callerContextAs } from '@tests/callers';
import { accessAuditActions } from '../../audit';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () => ({
    __esModule: true,
    ...jest.requireActual('@infrastructure/observability/audit'),
    emitAuditEvent: jest.fn()
}));

setupTestDb();
afterEach(() => jest.restoreAllMocks());

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
        const spy = jest.spyOn(membershipRepository, 'deleteById').mockRejectedValue(failure);

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

    it('revokes a role that never administered the place, even with zero admins in it', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('shopper', String(shop._id), 'tenant', 'customer');

        // Nobody administers this shop at all — a check that ran for every revoke regardless of
        // which role was deleted would refuse and restore a `customer` revoke here on the
        // strength of an administrator count `customer` could never have contributed to.
        await expect(revokeRole('shopper', String(shop._id), 'tenant')).resolves.toBeUndefined();
        expect(await membershipIn('shopper', String(shop._id), 'tenant')).toBeNull();
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
        // `admin` is the only preset that holds every tenant key — proving the invariant asks
        // the YAML, not a hand-picked name, by checking that fact rather than assuming it.
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
        // Any id will do: bootstrapping the shop alone grants nobody a role, seeded or not — the
        // demo's own accounts are `tests/integration/access.test.ts`'s concern, not this module's.
        expect(await membershipsOf('nobody-yet')).toEqual([]);
    });

    it('is idempotent, and keeps the id a first insert set', async () => {
        const first = await bootstrapAccessModel('Shop');
        const second = await bootstrapAccessModel('A different name');

        expect(String(second._id)).toBe(String(first._id));
        expect(second.name).toBe('Shop');
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
        // so a caller cannot express "grant admin" through it even by mistake — see `../../service.ts`.
    });

    it('assignRole refuses a name the shared presets do not declare', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await expect(
            assignRole('person-1', String(shop._id), 'tenant', 'not-a-real-role')
        ).rejects.toThrow(AccessInvariantError);
    });
});

describe('auditing a role change', () => {
    it('records a successful grant, naming the actor, the target and the role', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        const admin = callerContextAs('admin', 'admin-1');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await assignRole('target-user', String(shop._id), 'tenant', 'manager', undefined, admin);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_ASSIGNED,
                outcome: 'success',
                actor_user_id: 'admin-1',
                target_type: 'user',
                target_id: 'target-user',
                metadata: expect.objectContaining({ role: 'manager' })
            })
        );
    });

    it('records a refused escalation as a failure, not silence', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await expect(
            assignRole(
                'target-user',
                String(shop._id),
                'tenant',
                'admin',
                ['feedback.any.read'],
                testCallerContext
            )
        ).rejects.toThrow(AccessInvariantError);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_ASSIGNED,
                outcome: 'failure',
                target_id: 'target-user'
            })
        );
    });

    it('records a revoke', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('owner-a', String(shop._id), 'tenant', 'admin');
        await assignRole('owner-b', String(shop._id), 'tenant', 'admin');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await revokeRole('owner-a', String(shop._id), 'tenant', testCallerContext);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_REVOKED,
                outcome: 'success',
                target_id: 'owner-a',
                metadata: expect.objectContaining({ role: 'admin' })
            })
        );
    });

    it('audits nothing when no caller context is given — a self-service or system caller', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        const auditSpy = observePort(auditPort.emitAuditEvent);

        await assignRole('target-user', String(shop._id), 'tenant', 'manager');

        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('revokeAllOf', () => {
    it('clears every membership a person holds, tenant and platform alike', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        // A second administrator in EACH scope, so neither revoke below is a last-admin case.
        await assignRole('another-admin', String(shop._id), 'tenant', 'admin');
        await assignRole('another-operator', null, 'platform', 'operator');
        await assignRole('person-1', String(shop._id), 'tenant', 'admin');
        await assignRole('person-1', null, 'platform', 'operator');

        await revokeAllOf('person-1');

        expect(await membershipsOf('person-1')).toEqual([]);
    });

    it('refuses, and keeps every row, when one membership is the shop’s last administrator', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('only-owner', String(shop._id), 'tenant', 'admin');
        await assignRole('only-owner', null, 'platform', 'operator');

        await expect(revokeAllOf('only-owner')).rejects.toThrow(AccessInvariantError);
        expect(await administratorsOf(String(shop._id), 'tenant')).toEqual(['only-owner']);
    });
});

describe('assertCanGrant', () => {
    it('resolves without writing anything, for a grant that would succeed', () => {
        const granter = permissionsOfRole('admin');

        expect(() => assertCanGrant('tenant', 'manager', granter)).not.toThrow();
    });

    it('throws the same refusal assignRole would, synchronously rather than as a rejection', () => {
        expect(() => assertCanGrant('tenant', 'admin', ['feedback.any.read'])).toThrow(
            /privilege-escalation/
        );
    });
});

describe('granting the default grantable role', () => {
    it('lets a caller holding users.any.create grant customer despite lacking its own keys', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        // `moderator` holds none of `customer`'s keys (`orders.self.read`, `payments.self.read`,
        // `products.self.read`, `locales.self.read`, `delivery.any.read`) — only `users.any.create`
        // is what makes this grant not an escalation.
        const moderatorKeys = permissionsOfRole('moderator');

        await expect(
            assignRole('new-user', String(shop._id), 'tenant', 'customer', moderatorKeys)
        ).resolves.toBeDefined();
    });

    it('still refuses the same grant without users.any.create', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await expect(
            assignRole('new-user', String(shop._id), 'tenant', 'customer', ['orders.any.read'])
        ).rejects.toThrow(/privilege-escalation/);
    });

    it('does not extend the exemption to any other role', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        const moderatorKeys = permissionsOfRole('moderator');

        await expect(
            assignRole('new-user', String(shop._id), 'tenant', 'unverified', moderatorKeys)
        ).rejects.toThrow(/privilege-escalation/);
    });
});

describe('rolesOfMany', () => {
    it('batch-resolves the tenant role for a set of people in one query', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('person-1', String(shop._id), 'tenant', 'manager');
        await assignRole('person-2', String(shop._id), 'tenant', 'customer');

        const roles = await rolesOfMany(['person-1', 'person-2', 'nobody'], String(shop._id));

        expect(roles.get('person-1')).toBe('manager');
        expect(roles.get('person-2')).toBe('customer');
        expect(roles.has('nobody')).toBe(false);
    });

    it('answers an empty map for an empty page, with no query at all', async () => {
        expect(await rolesOfMany([], DEPLOYMENT_TENANT_ID)).toEqual(new Map());
    });
});
