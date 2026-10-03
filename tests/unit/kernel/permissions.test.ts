/**
 * @module
 * `shared/authorization-keys.yaml` and `shared/authorization-roles.yaml` are parsed against a Zod
 * schema at import, not merely cast — see `permissions.ts`'s own docblock. A malformed file must
 * fail loudly, naming what was wrong, rather than load a rule that silently never matches.
 */

import { z } from 'zod';
import {
    ANONYMOUS_ROLE,
    anonymousCaller,
    isBelowLevel,
    keysDocumentSchema,
    levelOfRole,
    levelOfRoles,
    permissionModelVersion,
    PERMISSION_KEYS,
    PRESET_ROLES,
    rolesDocumentSchema
} from '@kernel/permissions';
import { callerAs } from '@tests/callers';

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
                anonymous: {
                    name: 'guest',
                    scope: 'tenant',
                    level: 'user',
                    permissions: ['products.self.read']
                }
            }).success
        ).toBe(true);
    });

    it('refuses a role with no permissions array', () => {
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [
                { name: 'moderator', scope: 'tenant', title: 't', description: 'd', level: 'staff' }
            ],
            anonymous: { name: 'guest', scope: 'tenant', level: 'user', permissions: [] }
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
            anonymous: { name: 'guest', scope: 'tenant', level: 'user', permissions: [] }
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
            anonymous: { name: 'guest', scope: 'tenant', level: 'user', permissions: [] }
        });

        expect(result.success).toBe(false);
    });

    it('refuses an anonymous role with no level', () => {
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [],
            anonymous: { name: 'guest', scope: 'tenant', permissions: [] }
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
        expect(ANONYMOUS_ROLE.name).toBeTruthy();
    });

    // There is no wildcard: `admin` is unrestricted only because it lists every tenant key by
    // name — bar the `shopperOnly` basket keys, since an administrator does not shop. This is what
    // stops a newly declared key from being silently forgotten off it, the same guarantee a scope
    // wildcard would give for free.
    it('grants admin every declared tenant key by name, bar the shopper-only ones', () => {
        const admin = PRESET_ROLES.find((role) => role.name === 'admin');
        expect(admin).toBeDefined();

        const tenantKeys = PERMISSION_KEYS.filter(
            (key) => key.scope === 'tenant' && !key.shopperOnly
        ).map((key) => key.key);
        const held = new Set(admin!.permissions);
        const missing = tenantKeys.filter((key) => !held.has(key));

        expect(missing).toEqual([]);
    });

    // Staff and administrators do not shop: the two basket keys sit on the shopper roles only, and
    // the canary on the list says which keys they are, so a third one is a visible decision.
    it('holds the shopper-only keys on customer and unverified, and on no other role', () => {
        const shopperOnly = PERMISSION_KEYS.filter((key) => key.shopperOnly).map((key) => key.key);
        const holders = PRESET_ROLES.filter((role) =>
            shopperOnly.some((key) => role.permissions.includes(key))
        ).map((role) => role.name);

        expect(shopperOnly.toSorted()).toEqual(['cart.self.checkout', 'cart.self.update']);
        expect(holders.toSorted()).toEqual(['customer', 'unverified']);
    });

    it('keeps admin unrestricted without the basket keys', () => {
        expect(callerAs('admin').unrestricted).toBe(true);
        expect(callerAs('manager').unrestricted).toBe(false);
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
        unverified: 'user',
        customer: 'user',
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
        expect(ANONYMOUS_ROLE.level).toBe('user');
    });

    it('reads a person with no membership, or a role nothing declares, as user', () => {
        expect(levelOfRole(null)).toBe('user');
        expect(levelOfRole(undefined)).toBe('user');
        expect(levelOfRole('owner')).toBe('user');
    });

    it('counts a person holding two roles at the higher one', () => {
        expect(levelOfRoles({ tenant: 'customer', platform: null })).toBe('user');
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
