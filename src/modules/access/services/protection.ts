/**
 * @module
 * The protection of people: an account that holds a staff role is changed only by a holder of
 * `assign:Role`, and a money step on one's own order is flagged in the audit trail.
 *
 * @see docs/understand/authorization.md#protecting-people
 */

import type { CallerContext } from '@types';
import { holds } from '@kernel/ability';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { t } from '@infrastructure/i18n';
import { auditForbidden } from '@infrastructure/observability/forbidden';
import { generateReject, type ResponseReject } from '@infrastructure/http/response';
import { ERROR_CODES } from '@api/error-codes';
import { mayChangeAccount } from '../domain';
import { membershipsOf, rolesOfMany } from './memberships';

/** The `metadata.reason` of a `security.forbidden` row for a refusal because the account holds a staff role. */
export const ROLE_PROTECTED_REASON = 'role_protected';

/**
 * The reasons the shop's own rules write on a `security.forbidden` row — shop business, which the
 * platform operator's incident view leaves out.
 */
export const SHOP_REFUSAL_REASONS: readonly string[] = [ROLE_PROTECTED_REASON];

/**
 * Does this person hold a staff role, in the shop or over the installation? Read fresh from the
 * membership rows rather than from a session, because it is asked about the OWNER of an account —
 * somebody who is not making this request.
 *
 * @param userId - the person asked about
 */
export const holdsStaffRole = (userId: string): Promise<boolean> =>
    membershipsOf(userId).then((memberships) => memberships.length > 0);

/**
 * {@link holdsStaffRole} for a set of people, in two queries rather than two per person — the
 * batched sibling the inactivity reaper and a users list page need.
 *
 * @param userIds - the people asked about
 * @returns the ids among them that hold a staff role
 */
export const staffHoldersAmong = (userIds: readonly string[]): Promise<Set<string>> =>
    Promise.all([
        rolesOfMany(userIds, DEPLOYMENT_TENANT_ID, 'tenant'),
        rolesOfMany(userIds, null, 'platform')
    ]).then(([tenant, platform]) => new Set([...tenant.keys(), ...platform.keys()]));

/**
 * May this caller change the account `accountId`? An account that holds a staff role may only be
 * changed by a holder of `assign:Role`, asked AFTER the route's own key: a moderator who may
 * erase accounts erases customers, never the administrator.
 *
 * Answers yes, without a lookup, for:
 *
 *   - the system actor — a sweep or the reaper acts for nobody;
 *   - a holder of `assign:Role`.
 *
 * The caller's own account is judged like any other: a staff member without `assign:Role` does
 * not change their own, and a key never changes its minter's.
 *
 * The caller is required, not optional: a missing one would have to answer yes or no, and a "yes"
 * by convention is a protection that fails open. A path with no request behind it (self-erasure)
 * does not ask this at all.
 *
 * @param context - the caller
 * @param accountId - the account about to be changed
 */
export const canChangeAccount = (context: CallerContext, accountId: string): Promise<boolean> => {
    const caller = { holdsAssignRole: holds(context.caller, 'assign', 'Role') };
    // The worst case, a staff account, already passes for a holder of `assign:Role`: no lookup.
    if (context.caller.system || mayChangeAccount(caller, { holdsStaffRole: true }))
        return Promise.resolve(true);

    return holdsStaffRole(accountId).then((staff) =>
        mayChangeAccount(caller, { holdsStaffRole: staff })
    );
};

/**
 * The `403 ROLE_MANAGEMENT_REQUIRED` envelope: the answer to anything that needs `assign:Role` and
 * did not have it — changing a staff account, or handing out a role.
 */
export const roleManagementRequired = (): ResponseReject =>
    generateReject(403, [
        {
            code: ERROR_CODES.ROLE_MANAGEMENT_REQUIRED,
            message: t('generic.error-role-management-required')
        }
    ]);

/**
 * {@link canChangeAccount} as a refusal a service can return: `undefined` to carry on, or the
 * `403 ROLE_MANAGEMENT_REQUIRED` envelope — recorded as a failed `security.forbidden` first, so an
 * attempt on a staff account leaves a row naming who tried what to whom.
 *
 * @param context - the caller
 * @param accountId - the account about to be changed
 */
export const roleProtectedRefusal = (
    context: CallerContext,
    accountId: string
): Promise<ResponseReject | undefined> =>
    canChangeAccount(context, accountId).then((allowed) => {
        if (allowed) return undefined;

        auditForbidden(context, {
            targetType: 'user',
            targetId: accountId,
            metadata: { reason: ROLE_PROTECTED_REASON }
        });

        return roleManagementRequired();
    });
