/**
 * @module
 * The access service: three files behind one door — who may hand out which role (`grants`), who
 * holds which role where (`memberships`), and the protection of staff accounts (`protection`).
 * Everything that reads or writes the database rides `accessService`; constants, the error class
 * and the pure grant and ownership checks are named exports. `role-audit`'s `auditRoleChange` and
 * the grant internals are not published.
 *
 * See: docs/theory/authorization.md
 */

import { assertCanGrantAudited } from './grants';
import {
    assignRole,
    bootstrapAccess,
    ensureTenant,
    eraseMemberships,
    membershipIn,
    membershipsOf,
    revokeAllOf,
    revokeRole,
    rolesOf,
    rolesOfMany
} from './memberships';
import {
    canChangeAccount,
    holdsStaffRole,
    roleProtectedRefusal,
    staffHoldersAmong
} from './protection';
import { auditRoleAssigned, auditRoleRevoked } from './role-audit';

export { AccessInvariantError, assertCanGrant, grantableRoles } from './grants';
export { DEPLOYMENT_TENANT_SLUG } from './memberships';
export {
    isOwnThing,
    ownOrderFlag,
    ROLE_PROTECTED_REASON,
    SHOP_REFUSAL_REASONS
} from './protection';

/** The service's public surface — every operation of this module that reads or writes the database. */
export const accessService = {
    assertCanGrantAudited,
    assignRole,
    bootstrapAccess,
    ensureTenant,
    eraseMemberships,
    membershipIn,
    membershipsOf,
    revokeAllOf,
    revokeRole,
    rolesOf,
    rolesOfMany,
    canChangeAccount,
    holdsStaffRole,
    roleProtectedRefusal,
    staffHoldersAmong,
    auditRoleAssigned,
    auditRoleRevoked
};
