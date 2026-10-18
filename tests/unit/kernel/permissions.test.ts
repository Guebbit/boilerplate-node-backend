/**
 * @module
 * `shared/authorization-keys.yaml` and `shared/authorization-roles.yaml` are parsed against a Zod
 * schema at import, not merely cast — see `permissions.ts`'s own docblock. A malformed file must
 * fail loudly, naming what was wrong, rather than load a rule that silently never matches.
 */

import { z } from 'zod';
import {
    AUDIENCE_NAMES,
    AUDIENCE_ROLES,
    audienceOf,
    isAudienceName,
    keysInScope,
    callerInScope,
    staffRoleWithheld,
    SYSTEM_ACTOR,
    keysDocumentSchema,
    permissionModelVersion,
    PERMISSION_RULES,
    PERMISSION_SETS,
    PRESET_ROLES,
    rolesDocumentSchema
} from '@kernel/permissions';
import { asRole, callerAs } from '@tests/callers';

/** A minimal, otherwise-valid keys document — each test below breaks exactly one field of it. */
const validKeysDocument = {
    version: 1,
    actions: ['read', 'display'],
    implies: { display: ['read'] },
    scopes: { tenant: 'Content belonging to one shop.', platform: 'Shared operational data.' },
    rules: [
        {
            module: 'products',
            subject: 'Product',
            action: 'read',
            scope: 'tenant',
            description: 'Read active products.'
        }
    ],
    sets: [
        {
            name: 'ProductStorefront',
            module: 'products',
            description: 'What the storefront shows.',
            rules: ['read:Product']
        }
    ]
};

describe('keysDocumentSchema', () => {
    it('accepts a well-formed document', () => {
        expect(keysDocumentSchema.safeParse(validKeysDocument).success).toBe(true);
    });

    it('refuses an action outside the declared vocabulary, naming the offending rule', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            rules: [{ ...validKeysDocument.rules[0], action: 'raed' }]
        });

        expect(result.success).toBe(false);
        if (result.success) return;
        expect(z.prettifyError(result.error)).toContain('rules');
        expect(z.prettifyError(result.error)).toContain('action');
    });

    it('refuses a rule missing its scope', () => {
        const { scope: _scope, ...ruleWithoutScope } = validKeysDocument.rules[0];
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            rules: [ruleWithoutScope]
        });

        expect(result.success).toBe(false);
    });

    it('refuses an unknown stepUp tier', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            rules: [{ ...validKeysDocument.rules[0], stepUp: 'criticl' }]
        });

        expect(result.success).toBe(false);
    });

    it('refuses conditions that are not an object', () => {
        const result = keysDocumentSchema.safeParse({
            ...validKeysDocument,
            rules: [{ ...validKeysDocument.rules[0], conditions: 'active' }]
        });

        expect(result.success).toBe(false);
    });
});

/** A minimal, otherwise-valid `audience` block. */
const validAudience = Object.fromEntries(
    AUDIENCE_NAMES.map((name) => [
        name,
        { title: `The ${name}`, description: 'd', sets: ['ProductStorefront'] }
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
                        sets: ['UserDisplay']
                    }
                ],
                audience: validAudience
            }).success
        ).toBe(true);
    });

    it('refuses a role with no sets array', () => {
        const result = rolesDocumentSchema.safeParse({
            version: 1,
            roles: [{ name: 'moderator', scope: 'tenant', title: 't', description: 'd' }],
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
    it('parsed without throwing at import — every declared rule, set and preset role loaded', () => {
        // If either file had failed its schema, importing `@kernel/permissions` above would
        // already have thrown and this whole test file would fail to load — these assertions are
        // the visible proof that didn't happen.
        expect(PERMISSION_RULES.length).toBeGreaterThan(0);
        expect(PERMISSION_SETS.length).toBeGreaterThan(0);
        expect(PRESET_ROLES.length).toBeGreaterThan(0);
        expect(AUDIENCE_ROLES.guest.permissions.length).toBeGreaterThan(0);
    });

    // There is no wildcard: `admin` is unrestricted only because it lists every tenant set by
    // name — bar the rules the `customer` audience already gives every signed-in account. This is
    // what stops a newly declared set from being silently forgotten off it, the same guarantee a
    // scope wildcard would give for free.
    it('grants admin every declared tenant rule by name, bar the customer audience’s', () => {
        const admin = PRESET_ROLES.find((role) => role.name === 'admin');
        expect(admin).toBeDefined();

        const audienceRules = new Set(AUDIENCE_ROLES.customer.permissions);
        const tenantRules = PERMISSION_RULES.filter(
            (rule) => rule.scope === 'tenant' && !audienceRules.has(rule.id)
        ).map((rule) => rule.id);
        const held = new Set(admin!.permissions);
        const missing = tenantRules.filter((id) => !held.has(id));

        expect(missing).toEqual([]);
    });

    // Every account shops, staff included: a staff role lists none of the audience's sets, since
    // the audience is unioned in. A set on both would say one thing twice and drift.
    it('lists no audience rule on a staff role', () => {
        const audienceRules = new Set(
            AUDIENCE_NAMES.flatMap((name) => AUDIENCE_ROLES[name].permissions)
        );
        const doubled = PRESET_ROLES.flatMap((role) =>
            role.permissions.filter((id) => audienceRules.has(id)).map((id) => `${role.name}:${id}`)
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

    // The mirror case: admin is tenant-scoped only, so it must never pick up a platform rule —
    // holding one would let a shop's own role reach across the tenant/platform wall the two-scope
    // split exists to prevent.
    it('grants admin no platform rule', () => {
        const admin = PRESET_ROLES.find((role) => role.name === 'admin');
        expect(admin).toBeDefined();

        const platformRules = PERMISSION_RULES.filter((rule) => rule.scope === 'platform').map(
            (rule) => rule.id
        );
        const held = new Set(admin!.permissions);

        expect(platformRules.some((id) => held.has(id))).toBe(false);
    });
});

/*
 * A plain `PERMISSION_RULES.length` cannot tell "the same rules" from "different rules of the
 * same count" — a rename or a rule-for-rule swap left the version untouched, so a client's cached
 * rules would go stale silently. These pin the fingerprint's actual properties instead.
 */
describe('permissionModelVersion', () => {
    it('changes when a rule is swapped for a different one, count unchanged', () => {
        const before = permissionModelVersion(['read:Product', 'read:Order']);
        const after = permissionModelVersion(['read:Product', 'write:Order']);

        expect(after).not.toBe(before);
    });

    it('does not change when the same rules are merely reordered', () => {
        const forward = permissionModelVersion(['read:Product', 'read:Order']);
        const backward = permissionModelVersion(['read:Order', 'read:Product']);

        expect(backward).toBe(forward);
    });

    it('changes when a rule is added or removed', () => {
        const smaller = permissionModelVersion(['read:Product']);
        const larger = permissionModelVersion(['read:Product', 'read:Order']);

        expect(larger).not.toBe(smaller);
    });

    it('is a non-negative integer', () => {
        const version = permissionModelVersion(PERMISSION_RULES.map((entry) => entry.id));

        expect(Number.isInteger(version)).toBe(true);
        expect(version).toBeGreaterThanOrEqual(0);
    });
});

/*
 * What protects people is a rule, not a rank: `assign:Role`, held by the administrator and by
 * nobody else. A staff role is only a list of sets.
 */
describe('role management', () => {
    it('is held by admin and the system actor that aliases it, and by no other role', () => {
        const holders = PRESET_ROLES.filter((role) => role.permissions.includes('assign:Role'));

        expect(holders.map((role) => role.name)).toEqual(['admin', 'system']);
    });

    it('declares no level on any role', () => {
        expect(PRESET_ROLES.every((role) => !('level' in role))).toBe(true);
    });
});

/*
 * The audience is computed per request, never stored: the same staff role is a customer's rules plus
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
        expect(callerAs('customer').permissions).toContain('checkout:Cart');
        expect(callerAs('unverified').permissions).not.toContain('checkout:Cart');
        expect(callerAs('unverified').permissions).toContain('update:Cart');
    });

    it('leaves authoring examples to staff, never to a shopper', () => {
        for (const name of ['unverified', 'customer'] as const) {
            expect(callerAs(name).permissions).not.toContain('create:Example');
        }
        expect(callerAs('editor').permissions).toContain('create:Example');
    });

    // `*Own`, `*Shopping` and `*Storefront` are the sets that make a signed-in account a shopper;
    // one left off the customer audience would leave a proven account unable to use the shop.
    it('gives the customer every own, shopping and storefront set', () => {
        const customer = new Set(AUDIENCE_ROLES.customer.permissions);
        const missing = PERMISSION_SETS.filter((set) => /(Own|Shopping|Storefront)$/.test(set.name))
            .flatMap((set) => set.rules.map((rule) => `${set.name}:${rule}`))
            .filter((entry) => !customer.has(entry.slice(entry.indexOf(':') + 1)));

        expect(missing).toEqual([]);
    });

    it('keeps the unverified audience within what the customer may do', () => {
        const customer = new Set(AUDIENCE_ROLES.customer.permissions);

        expect(AUDIENCE_ROLES.unverified.permissions.filter((id) => !customer.has(id))).toEqual([]);
    });

    it('gives a staff member the customer rules on top of the role’s own', () => {
        const manager = callerAs('manager').permissions;

        expect(manager).toEqual(expect.arrayContaining(AUDIENCE_ROLES.customer.permissions));
        expect(manager).toContain('display:Order');
    });

    it('gives a platform caller no shop rule from its audience', () => {
        expect(keysInScope('operator', 'platform', 'customer')).toEqual([
            'read:ObservabilitySnapshot'
        ]);
    });
});

/*
 * A staff role is data the account holds; the authenticator app is what switches it on. The same
 * account keeps what its audience holds either way, so signing in never narrows a shopper.
 */
describe('the staff gate', () => {
    const unarmedManager = { ...asRole('manager'), authenticatorArmed: false };
    const unarmedOperator = {
        ...asRole('customer'),
        roles: { tenant: null, platform: 'operator' }
    };

    it('withholds a staff role from an account with no authenticator app', () => {
        expect(staffRoleWithheld(unarmedManager)).toBe(true);
        expect(staffRoleWithheld(unarmedOperator)).toBe(true);
    });

    it('withholds nothing from an armed staff member, a shopper, or the system actor', () => {
        expect(staffRoleWithheld(asRole('manager'))).toBe(false);
        expect(staffRoleWithheld(asRole('customer'))).toBe(false);
        expect(staffRoleWithheld(SYSTEM_ACTOR)).toBe(false);
    });

    it('leaves the unarmed staff member the customer rules and nothing of the role', () => {
        const caller = callerInScope(unarmedManager, 'tenant');

        expect(caller.permissions).toEqual(AUDIENCE_ROLES.customer.permissions);
        expect(caller.permissions).not.toContain('display:Order');
        expect(caller.unrestricted).toBe(false);
    });

    it('gives an unarmed operator nothing in the platform scope', () => {
        expect(callerInScope(unarmedOperator, 'platform').permissions).toEqual([]);
    });

    it('restores the role the moment an authenticator app is armed', () => {
        const caller = callerInScope({ ...unarmedManager, authenticatorArmed: true }, 'tenant');

        expect(caller.permissions).toContain('display:Order');
    });
});
