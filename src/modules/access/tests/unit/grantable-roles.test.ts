/**
 * @module
 * `grantableRoles` in isolation: which tenant roles each preset caller may hand out, by the same
 * rule `validateGrant` applies on the write path. The table is the model — a role added to
 * `shared/authorization-roles.yaml` that changes who may grant what shows up here as a row to
 * review.
 */

import { permissionsOfRole, PRESET_ROLES } from '@kernel/permissions';
import { assertCanGrant, grantableRoles } from '../../service';

jest.mock('../../repository', () => ({
    membershipRepository: {},
    tenantRepository: {}
}));

/** Every tenant role, in declaration order. */
const everyTenantRole = PRESET_ROLES.filter((role) => role.scope === 'tenant').map(
    (role) => role.name
);

describe('grantableRoles', () => {
    // The rule is "hold `roles.any.assign`", so only a role manager hands out roles, and any of
    // them. `customer` and `unverified` are not roles at all: an audience is computed, so there is
    // nothing to grant.
    it.each([
        ['admin', everyTenantRole],
        ['moderator', []],
        ['support', []]
    ])('gives a %s caller %j', (granterRole, expected) => {
        expect(grantableRoles('tenant', permissionsOfRole(granterRole))).toEqual(expected);
    });

    it('gives an empty list to a caller holding no keys', () => {
        expect(grantableRoles('tenant', [])).toEqual([]);
    });

    it('offers no platform role in tenant scope', () => {
        expect(grantableRoles('tenant', permissionsOfRole('admin'))).not.toContain('operator');
    });

    it.each(
        ['admin', 'moderator'].flatMap((granterRole) =>
            everyTenantRole.map((role) => [granterRole, role])
        )
    )('agrees with the write path: a %s granting %s', (granterRole, role) => {
        const granter = permissionsOfRole(granterRole);
        const offered = grantableRoles('tenant', granter).includes(role);
        const grant = () => {
            assertCanGrant('tenant', role, granter);
        };

        if (offered) expect(grant).not.toThrow();
        else expect(grant).toThrow();
    });
});
