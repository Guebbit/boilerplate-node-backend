/**
 * @module
 * The audit rows of a role change — one place that knows what a grant or a revoke looks like in
 * the trail, so the three writers (a grant, a revoke, a refused attempt) cannot word it three ways.
 *
 * See: docs/theory/authorization.md
 */

import type { AuthorizationScope, CallerContext } from '@types';
import { recordAudit } from '@infrastructure/observability/audit';
import type { AuditAction } from '@infrastructure/observability/audit';
import { accessAuditActions } from '../audit';

/**
 * Record a role grant that has COMMITTED. {@link assignRole} given a `session` audits only its
 * failures, because its success is not true until the caller's transaction commits: the caller
 * calls this after.
 *
 * @param context - the caller to attribute the grant to
 * @param userId - the account that now holds the role
 * @param roleName - the role as the request spelled it
 * @param tenantId - the place the role is held in, `null` for platform scope
 * @param scope - the scope the role was assigned in
 */
export const auditRoleAssigned = (
    context: CallerContext,
    userId: string,
    roleName: string,
    tenantId: string | null,
    scope: AuthorizationScope
): void => {
    auditRoleChange(
        context,
        accessAuditActions.ROLE_ASSIGNED,
        'success',
        userId,
        roleName.toLowerCase(),
        tenantId,
        scope
    );
};

/**
 * Record a role revoke that has COMMITTED — the revoke twin of {@link auditRoleAssigned}.
 *
 * @param context - the caller to attribute the revoke to
 * @param userId - the account that no longer holds the role
 * @param roleName - the role that was taken away
 * @param tenantId - the place the role was held in, `null` for platform scope
 * @param scope - the scope the role was held in
 */
export const auditRoleRevoked = (
    context: CallerContext,
    userId: string,
    roleName: string,
    tenantId: string | null,
    scope: AuthorizationScope
): void => {
    auditRoleChange(
        context,
        accessAuditActions.ROLE_REVOKED,
        'success',
        userId,
        roleName,
        tenantId,
        scope
    );
};

/**
 * One audit row for a role grant or revoke, success or failure — a single shared block instead of
 * {@link assignRole}/{@link revokeRole} each emitting their own near-identical `emitAuditEvent`/
 * `buildAuditEvent` call. Four separate, near-identical blocks are exactly the shape that lets one
 * of them (revoke's failure branch) quietly drop `role` from its metadata while the others keep it.
 *
 * @param userId - `undefined` for a grant refused before the account exists (an admin create)
 * @param role - `undefined` when nothing was there to name (an assign's `roleName` is always
 *   known; a revoke with no membership found, or whose role wasn't yet resolved when it failed,
 *   has none) — omitted from `metadata` rather than sent as `undefined`
 */
export const auditRoleChange = (
    context: CallerContext,
    action: AuditAction,
    outcome: 'success' | 'failure',
    userId: string | undefined,
    role: string | undefined,
    tenantId: string | null,
    scope: AuthorizationScope
): void => {
    recordAudit(context, {
        action,
        outcome,
        targetType: 'user',
        targetId: userId,
        metadata: role === undefined ? { tenantId, scope } : { role, tenantId, scope }
    });
};
