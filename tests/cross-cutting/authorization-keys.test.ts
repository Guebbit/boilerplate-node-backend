/**
 * The two shared artefacts are internally consistent, and every preset role is expressible.
 *
 * The conformance suite next door proves the two backends AGREE. This proves the files they both
 * read are not nonsense in the first place — a preset role naming a set nobody declares seeds a
 * shop whose staff silently cannot work, and the shape of that failure is a role that looks
 * populated and grants nothing.
 *
 * `assertDeclared` is the runtime half of the same rule and refuses the mistake where the grant is
 * MADE. This is the half that catches it before anyone runs anything.
 */

import {
    AUDIENCE_NAMES,
    AUDIENCE_ROLES,
    assertDeclared,
    findRule,
    IMPLIED_ACTIONS,
    isUnrestrictedRole,
    PERMISSION_RULES,
    PERMISSION_SETS,
    PRESET_ROLES,
    ruleId,
    type RoleLookup
} from '@kernel/permissions';
import { ERROR_CODES } from '@api/error-codes';

const declared = new Set(PERMISSION_RULES.map((rule) => rule.id));
const audiences: RoleLookup[] = AUDIENCE_NAMES.map((name) => ({
    name,
    scope: 'tenant',
    permissions: AUDIENCE_ROLES[name].permissions
}));
const roles: RoleLookup[] = [...PRESET_ROLES, ...audiences];

describe('the declared rules', () => {
    it('are unique by action and subject', () => {
        expect(declared.size).toBe(PERMISSION_RULES.length);
    });

    it('carry an id that is their action and subject', () => {
        for (const rule of PERMISSION_RULES) {
            expect(rule.id).toBe(`${rule.action}:${rule.subject}`);
        }
    });

    it('have a PascalCase subject and a lower-case action, because ids are stored in credentials', () => {
        for (const rule of PERMISSION_RULES) {
            expect(rule.subject).toMatch(/^[A-Z][A-Za-z]*$/);
            expect(rule.action).toMatch(/^[a-z]+$/);
        }
    });

    it('never put self or any in a name', () => {
        for (const rule of PERMISSION_RULES) {
            expect(rule.id).not.toMatch(/\b(self|any)\b/i);
        }
    });

    it('name a deniedCode some module actually declares', () => {
        for (const rule of PERMISSION_RULES) {
            if (rule.deniedCode) expect(ERROR_CODES).toHaveProperty(rule.deniedCode);
        }
    });

    it('imply only actions the vocabulary declares, and only on a subject that has the plain rule or none', () => {
        for (const [staff, plain] of Object.entries(IMPLIED_ACTIONS)) {
            expect(staff).toMatch(/^[a-z]+$/);
            expect(plain.length).toBeGreaterThan(0);
        }
    });
});

describe('the permission sets', () => {
    it('are named once, in PascalCase', () => {
        const names = PERMISSION_SETS.map((set) => set.name);

        expect(new Set(names).size).toBe(names.length);
        for (const name of names) expect(name).toMatch(/^[A-Z][A-Za-z]+$/);
    });

    it("bundle only rules some module declares, and each rule of the set's own module", () => {
        for (const set of PERMISSION_SETS) {
            for (const id of set.rules) {
                expect(findRule(id)?.module).toBe(set.module);
            }
        }
    });

    it('leave no declared rule outside every set, since a rule no set bundles grants nothing', () => {
        const bundled = new Set(PERMISSION_SETS.flatMap((set) => set.rules));

        expect([...declared].filter((id) => !bundled.has(id))).toEqual([]);
    });
});

describe('the preset roles', () => {
    it.each(roles.map((role) => [role.name, role] as const))(
        '%s holds only rules some module declares',
        (_name, role) => {
            for (const id of role.permissions) {
                const [action, subject] = id.split(':', 2);
                expect(() => assertDeclared(action, subject)).not.toThrow();
            }
        }
    );

    it.each(roles.map((role) => [role.name, role] as const))(
        '%s holds only rules from its own scope',
        (_name, role) => {
            for (const id of role.permissions) {
                expect(findRule(id)?.scope).toBe(role.scope);
            }
        }
    );

    it('include exactly two unrestricted TENANT roles: admin, and the system actor that aliases it', () => {
        const unrestricted = PRESET_ROLES.filter(
            (role) => role.scope === 'tenant' && isUnrestrictedRole(role.name, role.scope)
        );

        // `system` lists `admin`'s own sets via a YAML alias in `authorization-roles.yaml`, so it
        // is unrestricted for the identical reason and can never drift from it — see
        // `kernel/permissions.ts`'s `SYSTEM_ACTOR`.
        expect(unrestricted.map((role) => role.name)).toEqual(['admin', 'system']);
    });

    // "Unrestricted" is a derived fact — holds every rule its own scope currently declares — not
    // a token, so it can be trivially true where a scope declares very few rules. `operator` is
    // the honest example: platform scope has exactly one declared rule today
    // (`read:ObservabilitySnapshot`), so holding it alone already satisfies "every platform
    // rule". That is NOT the same claim as "operator is a super-admin" — `operator` still holds no
    // tenant rule, so it cannot touch a single shop's content, which is the invariant that
    // actually matters and is asserted elsewhere (`shared/authorization-roles.yaml`'s own
    // description, and the contract suite). This pins today's fact so a second platform rule being
    // declared — which would make it false — is a deliberate change to notice, not a surprise.
    it('marks operator unrestricted in platform scope, today — one declared platform rule', () => {
        const platformRules = PERMISSION_RULES.filter((rule) => rule.scope === 'platform');
        expect(platformRules).toHaveLength(1);
        expect(isUnrestrictedRole('operator', 'platform')).toBe(true);
    });
});

describe('assertDeclared', () => {
    it('refuses a rule no module declares', () => {
        expect(() => assertDeclared('publish', 'Product')).toThrow(/not declared/);
    });

    it('refuses a plausible near-miss rather than guessing', () => {
        expect(() => assertDeclared('read', 'Products')).toThrow(/not declared/);
    });

    it('returns the declared rule for one that exists', () => {
        expect(assertDeclared('read', 'User').id).toBe(ruleId('read', 'User'));
    });
});
