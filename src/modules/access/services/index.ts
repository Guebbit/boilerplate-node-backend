/**
 * @module
 * The access service: three files behind one door — who may hand out which role (`grants`), who
 * holds which role where (`memberships`), and the protection of staff accounts (`protection`). What
 * a sibling may call is exactly what is named here; `role-audit` and the grant internals are not.
 *
 * See: docs/theory/authorization.md
 */

export {
    AccessInvariantError,
    assertCanGrant,
    assertCanGrantAudited,
    grantableRoles
} from './grants';
export {
    assignRole,
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
} from './memberships';
export {
    canChangeAccount,
    holdsStaffRole,
    isOwnThing,
    ownOrderFlag,
    ROLE_PROTECTED_REASON,
    roleProtectedRefusal,
    SHOP_REFUSAL_REASONS,
    staffHoldersAmong
} from './protection';
export { auditRoleAssigned, auditRoleRevoked } from './role-audit';
