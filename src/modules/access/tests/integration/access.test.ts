/**
 * @module
 * The authorization model's STORAGE, against the in-memory Mongo `setupTestDb` wires up — the
 * module's own writers (`../../services/`, `../../repository.ts`) and the invariants they enforce.
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
    assertCanGrant,
    assertCanGrantAudited,
    assignRole,
    auditRoleAssigned,
    bootstrapAccessModel,
    DEPLOYMENT_TENANT_SLUG,
    ensureTenant,
    eraseMemberships,
    membershipIn,
    membershipsOf,
    revokeAllOf,
    revokeRole,
    rolesOf,
    rolesOfMany
} from '../../services';
import { membershipRepository } from '../../repository';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { permissionsOfRole } from '@kernel/permissions';
import * as auditPort from '@infrastructure/observability/audit';
import { observePort } from '@tests/ports';
import { withTransaction } from '@infrastructure/runtime/database';
import { testCallerContext, callerContextAs } from '@tests/callers';
import { accessAuditActions } from '../../audit';

/* Replaced, not spied on — see `tests/support/ports.ts` for why. */
jest.mock('@infrastructure/observability/audit', () =>
    jest.requireActual<typeof import('@tests/ports')>('@tests/ports').auditPortMock()
);

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

        await assignRole('person-1', String(shop._id), 'tenant', 'support');
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
            assignRole('person-1', String(shop._id), 'tenant', 'admin', ['read:Feedback'])
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

    it('removes even the last member who can administer a shop, leaving it with none', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('only-owner', String(shop._id), 'tenant', 'admin');

        await revokeRole('only-owner', String(shop._id), 'tenant');

        expect(await rolesOf('only-owner', String(shop._id))).toEqual({
            tenant: null,
            platform: null
        });
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

    it.each(['customer', 'unverified', 'guest'])(
        'assignRole refuses %s: an audience is computed, never granted',
        async (audience) => {
            const shop = await ensureTenant('shop', 'The Shop');

            await expect(
                assignRole('person-1', String(shop._id), 'tenant', audience)
            ).rejects.toThrow(AccessInvariantError);
            expect(await membershipIn('person-1', String(shop._id), 'tenant')).toBeNull();
        }
    );

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
                actorUserId: 'admin-1',
                targetType: 'user',
                targetId: 'target-user',
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
                ['read:Feedback'],
                testCallerContext
            )
        ).rejects.toThrow(AccessInvariantError);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_ASSIGNED,
                outcome: 'failure',
                targetId: 'target-user'
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
                targetId: 'owner-a',
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

describe('assignRole inside a caller transaction', () => {
    it('audits no success of its own, leaving that to the caller once it has committed', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        const auditSpy = observePort(auditPort.emitAuditEvent);
        const context = callerContextAs('admin');

        await withTransaction((session) =>
            assignRole('in-tx', String(shop._id), 'tenant', 'manager', undefined, context, session)
        );
        expect(auditSpy).not.toHaveBeenCalled();

        auditRoleAssigned(context, 'in-tx', 'Manager', String(shop._id), 'tenant');
        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_ASSIGNED,
                outcome: 'success',
                targetId: 'in-tx',
                metadata: { role: 'manager', tenantId: String(shop._id), scope: 'tenant' }
            })
        );
    });

    it('rolls its membership back with the transaction', async () => {
        const shop = await ensureTenant('shop', 'The Shop');

        await expect(
            withTransaction((session) =>
                assignRole(
                    'rolled-back',
                    String(shop._id),
                    'tenant',
                    'manager',
                    undefined,
                    undefined,
                    session
                ).then(() => {
                    throw new Error('a later write failed');
                })
            )
        ).rejects.toThrow('a later write failed');

        expect(await membershipsOf('rolled-back')).toEqual([]);
    });
});

describe('assertCanGrantAudited', () => {
    it('audits a refused grant as a failure, with no target when the account does not exist yet', () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);

        expect(() =>
            assertCanGrantAudited(
                'tenant',
                'admin',
                ['read:Feedback'],
                callerContextAs('moderator')
            )
        ).toThrow(AccessInvariantError);

        expect(auditSpy).toHaveBeenCalledWith(
            expect.objectContaining({
                action: accessAuditActions.ROLE_ASSIGNED,
                outcome: 'failure',
                metadata: expect.objectContaining({ role: 'admin' })
            })
        );
    });

    it('audits nothing for a grant that would be accepted', () => {
        const auditSpy = observePort(auditPort.emitAuditEvent);

        assertCanGrantAudited(
            'tenant',
            'manager',
            permissionsOfRole('admin'),
            callerContextAs('admin')
        );

        expect(auditSpy).not.toHaveBeenCalled();
    });
});

describe('revokeAllOf', () => {
    it('clears every membership a person holds, tenant and platform alike', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('person-1', String(shop._id), 'tenant', 'admin');
        await assignRole('person-1', null, 'platform', 'operator');

        await revokeAllOf('person-1');

        expect(await membershipsOf('person-1')).toEqual([]);
    });
});

describe('eraseMemberships', () => {
    it('removes every membership one person holds, and nobody else’s', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('erased', String(shop._id), 'tenant', 'admin');
        await assignRole('erased', null, 'platform', 'operator');
        await assignRole('bystander', String(shop._id), 'tenant', 'editor');

        await withTransaction((session) => eraseMemberships('erased', session));

        expect(await membershipsOf('erased')).toEqual([]);
        expect(await membershipsOf('bystander')).toHaveLength(1);
    });

    it('is undone with the transaction it joined', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('kept', String(shop._id), 'tenant', 'admin');

        await expect(
            withTransaction((session) =>
                eraseMemberships('kept', session).then(() => {
                    throw new Error('a later step failed');
                })
            )
        ).rejects.toThrow('a later step failed');

        expect(await membershipsOf('kept')).toHaveLength(1);
    });
});

describe('assertCanGrant', () => {
    it('resolves without writing anything, for a grant that would succeed', () => {
        const granter = permissionsOfRole('admin');

        expect(() => assertCanGrant('tenant', 'manager', granter)).not.toThrow();
    });

    it('throws the same refusal assignRole would, synchronously rather than as a rejection', () => {
        expect(() => assertCanGrant('tenant', 'admin', ['read:Feedback'])).toThrow(
            /privilege-escalation/
        );
    });
});

describe('rolesOfMany', () => {
    it('batch-resolves the tenant role for a set of people in one query', async () => {
        const shop = await ensureTenant('shop', 'The Shop');
        await assignRole('person-1', String(shop._id), 'tenant', 'manager');
        await assignRole('person-2', String(shop._id), 'tenant', 'editor');

        const roles = await rolesOfMany(['person-1', 'person-2', 'nobody'], String(shop._id));

        expect(roles.get('person-1')).toBe('manager');
        expect(roles.get('person-2')).toBe('editor');
        expect(roles.has('nobody')).toBe(false);
    });

    it('answers an empty map for an empty page, with no query at all', async () => {
        expect(await rolesOfMany([], DEPLOYMENT_TENANT_ID)).toEqual(new Map());
    });
});
