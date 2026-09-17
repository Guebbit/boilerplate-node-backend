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
    PERMISSION_KEYS,
    PRESET_ROLES,
    scopeOfKey,
    wildcardKeyFor,
    type PresetRole
} from '@kernel/permissions';

const declared = new Set(PERMISSION_KEYS.map((key) => key.key));
const roles: PresetRole[] = [...PRESET_ROLES, ANONYMOUS_ROLE as PresetRole];

describe('the declared keys', () => {
    it('spell their scope the way the resolver reads it', () => {
        for (const key of PERMISSION_KEYS) {
            expect(scopeOfKey(key.key)).toBe(key.scope);
        }
    });

    it('are unique', () => {
        expect(declared.size).toBe(PERMISSION_KEYS.length);
    });

    it('name the action their key ends with, or expand as a wildcard', () => {
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

    it('include exactly one unrestricted role per scope, and it is spelled as a wildcard', () => {
        const unrestricted = PRESET_ROLES.filter((role) =>
            role.permissions.includes(wildcardKeyFor(role.scope))
        );

        expect(unrestricted.map((role) => role.name)).toEqual(['owner']);
    });
});

describe('assertDeclared', () => {
    it('refuses a key no module declares', () => {
        expect(() => assertDeclared('products.publish')).toThrow(/not declared/);
    });

    it('refuses a plausible near-miss rather than guessing', () => {
        expect(() => assertDeclared('product.read')).toThrow(/not declared/);
    });

    it('accepts the wildcard of either scope, which is not a declared key', () => {
        expect(() => assertDeclared('all.manage')).not.toThrow();
        expect(() => assertDeclared('platform.all.manage')).not.toThrow();
    });
});
