/**
 * @module
 * `shared/authorization-keys.yaml` and `shared/authorization-roles.yaml` are parsed against a Zod
 * schema at import, not merely cast — see `permissions.ts`'s own docblock. A malformed file must
 * fail loudly, naming what was wrong, rather than load a rule that silently never matches.
 */

import { z } from 'zod';
import {
    anonymousCaller,
    AUDIENCE_NAMES,
    AUDIENCE_ROLES,
    audienceOf,
    isAudienceName,
    keysInScope,
    callerInScope,
    isBelowLevel,
    keysDocumentSchema,
    levelOfRole,
    levelOfRoles,
    permissionModelVersion,
    PERMISSION_KEYS,
    PRESET_ROLES,
    rolesDocumentSchema
} from '@kernel/permissions';
import { asRole, callerAs } from '@tests/callers';

/** A minimal, otherwise-valid keys document — each test below breaks exactly one field of it. */
const validKeysDocument = {
    version: 1,
    actions: ['read'],
    scopes: { tenant: 'Content belonging to one shop.', platform: 'Shared operational data.' },
    keys: [
        {
            key: 'products.self.read',
            module: 'products',
            subject: 'Product',
            action: 'read',
            scope: 'tenant',
            description: 'Read active products.'
        }
    ]
};

describe('keysDocumentSchema', () => {
    it('accepts a well-formed document', () => {
        expect(keysDocumentSchema.safeParse(validKeysDocument).success).toBe(true);
    });

    it('refuses an action outside the declared vocabulary, naming the offending key', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [{ ...validKeysDocument.keys[0], action: 'raed' }]
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(z.prettifyError(result.error)).toContain('keys');
        expect(z.prettifyError(result.error)).toContain('action');
    });

    it('refuses a key missing its scope', () => {
        const { scope: _scope, ...keyWithoutScope } = validKeysDocument.keys[0];
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [keyWithoutScope]
        });

        expect(result.success).toBe(false);
    });

    it('refuses an unknown stepUp tier', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [{ ...validKeysDocument.keys[0], stepUp: 'criticl' }]
        });

        expect(result.success).toBe(false);
    });

    it('refuses conditions that are not an object', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            keys: [{ ...validKeysDocument.keys[0], conditions: 'active' }]
        });

        expect(result.success).toBe(false);
    });
});

/** A minimal, otherwise-valid `audience` block. */
const validAudience = Object.fromEntries(
    AUDIENCE_NAMES.map((name) => [
        name,
        { title: `The ${name}`, description: 'd', permissions: ['products.self.read'] }
    ])
);

describe('rolesDocumentSchema', () => {
    it('accepts a well-formed document', () => {
        expect(
            rolesDocumentSchema.safeParse({
                version: 1,
                roles: [
                    {
                        name: 'moderator',
                        scope: 'tenant',
                        title: 'The moderator',
                        description: 'Accounts and orders.',
                        level: 'staff',
                        permissions: ['users.any.read']
                    }
                ],
                audience: validAudience
            }).success
        ).toBe(true);
    });

    it('refuses a role with no permissions array', () => {
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [
                { name: 'moderator', scope: 'tenant', title: 't', description: 'd', level: 'staff' }
            ],
            audience: validAudience
        });

        expect(result.success).toBe(false);
    });

    // A role cannot be added without deciding where it ranks: the load fails, and the pretty
    // error names the field.
    it('refuses a role with no level, naming the field', () => {
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [
                {
                    name: 'moderator',
                    scope: 'tenant',
                    title: 't',
                    description: 'd',
                    permissions: []
                }
            ],
            audience: validAudience
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(z.prettifyError(result.error)).toContain('level');
    });

    it('refuses a level outside admin, staff and user', () => {
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [
                {
                    name: 'moderator',
                    scope: 'tenant',
                    title: 't',
                    description: 'd',
                    level: 'owner',
                    permissions: []
                }
            ],
            audience: validAudience
        });

        expect(result.success).toBe(false);
    });

    it('refuses an audience block missing one of the three computed roles', () => {
        const { customer: _customer, ...withoutCustomer } = validAudience;
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [],
            audience: withoutCustomer
        });

        expect(result.success).toBe(false);
    });
});

describe('the real shared authorization files', () => {
    it('parsed without throwing at import — every declared key and preset role loaded', () => {
        // If either file had failed its schema, importing `@kernel/permissions` above would
        // already have thrown and this whole test file would fail to load — these assertions are
        // the visible proof that didn't happen.
        expect(PERMISSION_KEYS.length).toBeGreaterThan(0);
        expect(PRESET_ROLES.length).toBeGreaterThan(0);
        expect(AUDIENCE_ROLES.guest.permissions.length).toBeGreaterThan(0);
    });

    // There is no wildcard: `admin` is unrestricted only because it lists every tenant key by
    // name — bar the ones the `customer` audience already gives every signed-in account. This is
    // what stops a newly declared key from being silently forgotten off it, the same guarantee a
    // scope wildcard would give for free.
    it('grants admin every declared tenant key by name, bar the customer audience’s', () => {
        const admin = PRESET_ROLES.find((role) => role.name === 'admin');
        expect(admin).toBeDefined();

        const audienceKeys = new Set(AUDIENCE_ROLES.customer.permissions);
        const tenantKeys = PERMISSION_KEYS.filter(
            (key) => key.scope === 'tenant' && !audienceKeys.has(key.key)
        ).map((key) => key.key);
        const held = new Set(admin!.permissions);
        const missing = tenantKeys.filter((key) => !held.has(key));

        expect(missing).toEqual([]);
    });

    // Every account shops, staff included: a staff role lists none of the audience's keys, since
    // the audience is unioned in. A key on both would say one thing twice and drift.
    it('lists no audience key on a staff role', () => {
        const audienceKeys = new Set(
            AUDIENCE_NAMES.flatMap((name) => AUDIENCE_ROLES[name].permissions)
        );
        const doubled = PRESET_ROLES.flatMap((role) =>
            role.permissions
                .filter((key) => audienceKeys.has(key))
                .map((key) => `${role.name}:${key}`)
        );

        expect(doubled).toEqual([]);
    });

    it('keeps admin unrestricted whether or not its address is proven', () => {
        expect(callerAs('admin').unrestricted).toBe(true);
        expect(callerAs('manager').unrestricted).toBe(false);
        expect(callerInScope({ ...asRole('admin'), verified: false }, 'tenant').unrestricted).toBe(
            true
        );
    });

    // The mirror case: admin is tenant-scoped only, so it must never pick up a platform key —
    // holding one would let a shop's own role reach across the tenant/platform wall the two-scope
    // split exists to prevent.
    it('grants admin no platform key', () => {
        const admin = PRESET_ROLES.find((role) => role.name === 'admin');
        expect(admin).toBeDefined();

        const platformKeys = PERMISSION_KEYS.filter((key) => key.scope === 'platform').map(
            (key) => key.key
        );
        const held = new Set(admin!.permissions);

        expect(platformKeys.some((key) => held.has(key))).toBe(false);
    });
});

/*
 * A plain `PERMISSION_KEYS.length` cannot tell "the same keys" from "different keys of the
 * same count" — a rename or a key-for-key swap left the version untouched, so a client's cached
 * rules would go stale silently. These pin the fingerprint's actual properties instead.
 */
describe('permissionModelVersion', () => {
    it('changes when a key is swapped for a different one, count unchanged', () => {
        const before = permissionModelVersion(['products.self.read', 'orders.self.read']);
        const after = permissionModelVersion(['products.self.read', 'orders.self.write']);

        expect(after).not.toBe(before);
    });

    it('does not change when the same keys are merely reordered', () => {
        const forward = permissionModelVersion(['products.self.read', 'orders.self.read']);
        const backward = permissionModelVersion(['orders.self.read', 'products.self.read']);

        expect(backward).toBe(forward);
    });

    it('changes when a key is added or removed', () => {
        const smaller = permissionModelVersion(['products.self.read']);
        const larger = permissionModelVersion(['products.self.read', 'orders.self.read']);

        expect(larger).not.toBe(smaller);
    });

    it('is a non-negative integer', () => {
        const version = permissionModelVersion(PERMISSION_KEYS.map((entry) => entry.key));

        expect(Number.isInteger(version)).toBe(true);
        expect(version).toBeGreaterThanOrEqual(0);
    });
});

/*
 * `level:` is data in the YAML and the second question after the keys. The table is written out
 * here on purpose: re-levelling a role is a decision, and this is where it shows up in review.
 */
describe('role levels', () => {
    const EXPECTED: Record<string, string> = {
        manager: 'staff',
        warehouse: 'staff',
        support: 'staff',
        editor: 'staff',
        moderator: 'staff',
        admin: 'admin',
        system: 'admin',
        operator: 'admin'
    };

    it('gives every preset role the level the shared file says, and the table covers them all', () => {
        expect(Object.fromEntries(PRESET_ROLES.map((role) => [role.name, role.level]))).toEqual(
            EXPECTED
        );
    });

    it('reads a person with no membership, or a role nothing declares, as user', () => {
        expect(levelOfRole(null)).toBe('user');
        expect(levelOfRole(undefined)).toBe('user');
        expect(levelOfRole('owner')).toBe('user');
    });

    it('counts a person holding two roles at the higher one', () => {
        expect(levelOfRoles({ tenant: null, platform: null })).toBe('user');
        expect(levelOfRoles({ tenant: 'support', platform: null })).toBe('staff');
        expect(levelOfRoles({ tenant: 'support', platform: 'operator' })).toBe('admin');
        expect(levelOfRoles({ tenant: 'admin', platform: 'operator' })).toBe('admin');
        expect(levelOfRoles({ tenant: null, platform: 'operator' })).toBe('admin');
    });

    it('is strictly below only for a lower rank', () => {
        expect(isBelowLevel('user', 'staff')).toBe(true);
        expect(isBelowLevel('staff', 'admin')).toBe(true);
        expect(isBelowLevel('user', 'admin')).toBe(true);
        expect(isBelowLevel('staff', 'staff')).toBe(false);
        expect(isBelowLevel('admin', 'staff')).toBe(false);
        expect(isBelowLevel('user', 'user')).toBe(false);
    });

    it('hands a stranger the user level', () => {
        expect(anonymousCaller().level).toBe('user');
    });

    it('stamps the caller with its person’s level', () => {
        expect(callerAs('moderator').level).toBe('staff');
        expect(callerAs('admin').level).toBe('admin');
        expect(callerAs('customer').level).toBe('user');
    });
});

/*
 * The audience is computed per request, never stored: the same staff role is a customer's keys plus
 * its own, and `verifiedAt` alone moves an account between `unverified` and `customer`.
 */
describe('audience roles', () => {
    it('names the audience from the session and its proven address, and nothing else', () => {
        expect(audienceOf(undefined)).toBe('guest');
        expect(audienceOf({ verified: false })).toBe('unverified');
        expect(audienceOf({ verified: true })).toBe('customer');
    });

    it('tells an audience from a stored staff role', () => {
        expect(AUDIENCE_NAMES.every((name) => isAudienceName(name))).toBe(true);
        expect(PRESET_ROLES.some((role) => isAudienceName(role.name))).toBe(false);
    });

    it('lets only a proven address spend a basket', () => {
        expect(callerAs('customer').permissions).toContain('cart.self.checkout');
        expect(callerAs('unverified').permissions).not.toContain('cart.self.checkout');
        expect(callerAs('unverified').permissions).toContain('cart.self.update');
    });

    it('gives a staff member the customer keys on top of the role’s own', () => {
        const manager = callerAs('manager').permissions;

        expect(manager).toEqual(expect.arrayContaining(AUDIENCE_ROLES.customer.permissions));
        expect(manager).toContain('orders.any.read');
    });

    it('gives a platform caller no shop key from its audience', () => {
        expect(keysInScope('operator', 'platform', 'customer')).toEqual([
            'platform.observability.any.read'
        ]);
    });
});
