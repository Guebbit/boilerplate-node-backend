/**
 * The two shared artefacts are internally consistent, and every preset role is expressible.
 *
 * The conformance suite next door proves the two backends AGREE. This proves the files they both
 * read are not nonsense in the first place — a preset role naming a key nobody declares seeds a
 * shop whose staff silently cannot work, and the shape of that failure is a role that looks
 * populated and grants nothing.
 *
 * `assertDeclared` is the runtime half of the same rule and refuses the mistake where the grant is
 * MADE. This is the half that catches it before anyone runs anything.
 */

import {
    ANONYMOUS_ROLE,
    assertDeclared,
    isUnrestrictedRole,
    PERMISSION_KEYS,
    PRESET_ROLES,
    scopeOfKey,
    type RoleLookup
} from '@kernel/permissions';

const declared = new Set(PERMISSION_KEYS.map((key) => key.key));
const roles: RoleLookup[] = [...PRESET_ROLES, ANONYMOUS_ROLE];

describe('the declared keys', () => {
    it('spell their scope the way the resolver reads it', () => {
        for (const key of PERMISSION_KEYS) {
            expect(scopeOfKey(key.key)).toBe(key.scope);
        }
    });

    it('are unique', () => {
        expect(declared.size).toBe(PERMISSION_KEYS.length);
    });

    it('name the action their key ends with', () => {
        for (const key of PERMISSION_KEYS) {
            expect(key.key.endsWith(`.${key.action}`)).toBe(true);
        }
    });

    it('are lower-case and dotted, because they are stored and renaming one is a migration', () => {
        for (const key of PERMISSION_KEYS) {
            expect(key.key).toMatch(/^[a-z][.a-z]*[a-z]$/);
        }
    });
});

describe('the preset roles', () => {
    it.each(roles.map((role) => [role.name, role] as const))(
        '%s holds only keys some module declares',
        (_name, role) => {
            for (const key of role.permissions) {
                expect(() => assertDeclared(key)).not.toThrow();
            }
        }
    );

    it.each(roles.map((role) => [role.name, role] as const))(
        '%s holds only keys from its own scope',
        (_name, role) => {
            for (const key of role.permissions) {
                expect(scopeOfKey(key)).toBe(role.scope);
            }
        }
    );

    it('include exactly one unrestricted TENANT role, holding every tenant key by name', () => {
        const unrestricted = PRESET_ROLES.filter(
            (role) => role.scope === 'tenant' && isUnrestrictedRole(role.name, role.scope)
        );

        expect(unrestricted.map((role) => role.name)).toEqual(['admin']);
    });

    // "Unrestricted" is a derived fact now — holds every key its own scope currently declares —
    // not a token, so it can be trivially true where a scope declares very few keys. `operator` is
    // the honest example: platform scope has exactly one declared key today
    // (`platform.observability.any.read`), so holding it alone already satisfies "every platform
    // key". That is NOT the same claim as "operator is a super-admin" — `operator` still holds no
    // bare (tenant) key, so it cannot touch a single shop's content, which is the invariant that
    // actually matters and is asserted elsewhere (`shared/authorization-roles.yaml`'s own
    // description, and the contract suite). This pins today's fact so a second platform key being
    // declared — which would make it false — is a deliberate change to notice, not a surprise.
    it('marks operator unrestricted in platform scope, today — one declared platform key', () => {
        const platformKeys = PERMISSION_KEYS.filter((key) => key.scope === 'platform');
        expect(platformKeys).toHaveLength(1);
        expect(isUnrestrictedRole('operator', 'platform')).toBe(true);
    });
});

describe('assertDeclared', () => {
    it('refuses a key no module declares', () => {
        expect(() => assertDeclared('products.publish')).toThrow(/not declared/);
    });

    it('refuses a plausible near-miss rather than guessing', () => {
        expect(() => assertDeclared('product.read')).toThrow(/not declared/);
    });
});
