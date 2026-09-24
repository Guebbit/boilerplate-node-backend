/**
 * @module
 * Whether a caller's own membership carries an unrestricted (admin) role — the fact every login
 * emit and audit record here needs for `actor_role`. Read fresh from the membership store rather
 * than trusted off a stale value: the account document itself carries no role of its own.
 */

import { isUnrestrictedRole } from '@kernel/permissions';
import { rolesOf } from '@modules/access';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';

/**
 * @param userId - the account to check
 * @returns whether `userId` holds an unrestricted role on this deployment's tenant
 */
export const isUnrestrictedCaller = (userId: string): Promise<boolean> =>
    rolesOf(userId, DEPLOYMENT_TENANT_ID).then((roles) => isUnrestrictedRole(roles.tenant));
