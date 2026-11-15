/**
 * @module
 * The role door: `assignUserRole` and `revokeUserRole`, the only way an existing account is given
 * a staff role or loses one. Each is a state change with its own check and audit row, so a repeat
 * is a 409 rather than a second success. Two callers naming different roles both succeed, and the
 * last write wins: there is no `If-Match` to fence them.
 *
 * Judged by the grant (`assign:Role`), not by `access`'s protection of staff accounts: a holder of
 * `assign:Role` always passes that, and nobody else gets here.
 *
 * @see docs/modules/users.md#the-role-door
 */

import type { ClientSession } from 'mongoose';
import { holds } from '@kernel/ability';
import { DEPLOYMENT_TENANT_ID } from '@kernel/access/tenant';
import { t } from '@infrastructure/i18n';
import {
    generateReject,
    generateSuccess,
    type ResponseReject,
    type ResponseSuccess
} from '@infrastructure/http/response';
import { withTransaction } from '@infrastructure/runtime/database';
import { ERROR_CODES, type ErrorCode } from '@api/error-codes';
import type { CallerContext } from '@types';
import { accessService, roleManagementRequired } from '@modules/access';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { roleRefusalReject } from './role-refusal';

/**
 * The tenant role the account holds now, or `null` for none.
 *
 * @param user - the loaded account
 */
const heldRoleOf = (user: UserDocument): Promise<string | null> =>
    accessService.rolesOf(String(user._id), DEPLOYMENT_TENANT_ID).then(({ tenant }) => tenant);

/**
 * A 409 for a role door that has nothing to do.
 *
 * @param code - the error code
 * @param messageKey - the locale key of its message
 */
const conflict = (code: ErrorCode, messageKey: string): ResponseReject =>
    generateReject(409, [{ code, message: t(messageKey) }]);

/**
 * The write half of both doors, in one transaction: the account's stamp moves (the role lives in
 * the membership, which Mongoose would never see change, so its `editRevision` would stay put
 * while the role moved) and `membership` runs beside it.
 *
 * @internal Behind the doors' checks. Unpublished: a sibling could re-role an account without
 * asking whether the caller may.
 *
 * @param user - the loaded account
 * @param membership - the membership write, joined to the transaction
 */
const writeRole = (
    user: UserDocument,
    membership: (session: ClientSession) => Promise<unknown>
): Promise<UserDocument> =>
    withTransaction((session) => {
        user.markModified('updatedAt');
        return userRepository
            .save(user, session)
            .then((saved) => membership(session).then(() => saved));
    });

/**
 * Give an existing account a staff role, replacing the one it holds. A refused grant is audited as
 * a failed `access.role.assigned` before anything is written.
 *
 * @param id - the account
 * @param role - the role named, a name from `grantableRoles`
 * @param context - the caller, whose keys decide whether they may hand roles out
 * @returns the user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` for a caller without
 *   `assign:Role`, 422 on a role nobody can be given, 409 `USER_ROLE_ALREADY_ASSIGNED` when the
 *   account holds it already
 */
export const assignUserRole = (
    id: string,
    role: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        // Returned, not thrown: a thrown miss is indistinguishable from a database error.
        if (!user) return generateReject(404, [t('users.not-found')]);

        const refusal = accessService.grantRefusalAudited(
            'tenant',
            role,
            context.caller.permissions,
            context,
            id
        );
        if (refusal) return roleRefusalReject(refusal);

        return heldRoleOf(user).then((held) => {
            // Held roles are stored lower-cased, so the name is compared that way.
            if (held === role.toLowerCase())
                return conflict(
                    ERROR_CODES.USER_ROLE_ALREADY_ASSIGNED,
                    'users.role-already-assigned'
                );

            return writeRole(user, (session) =>
                accessService.assignRole(
                    id,
                    DEPLOYMENT_TENANT_ID,
                    'tenant',
                    role,
                    context.caller.permissions,
                    context,
                    session
                )
            ).then((saved) => {
                // Only now is it true: it committed with the stamp.
                accessService.auditRoleAssigned(context, id, role, DEPLOYMENT_TENANT_ID, 'tenant');
                return generateSuccess(saved, 200);
            });
        });
    });

/**
 * Take an account's staff role away, leaving a plain customer.
 *
 * @param id - the account
 * @param context - the caller, who must hold `assign:Role`
 * @returns the user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` for a caller without
 *   `assign:Role`, 409 `USER_ROLE_NOT_ASSIGNED` when the account holds no role
 */
export const revokeUserRole = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        /**
         * The route already refuses this (and audits it); asked again so the door cannot be
         * reached around it.
         */
        if (!context.caller.system && !holds(context.caller, 'assign', 'Role'))
            return roleManagementRequired();

        return heldRoleOf(user).then((held) => {
            if (held === null)
                return conflict(ERROR_CODES.USER_ROLE_NOT_ASSIGNED, 'users.role-not-assigned');

            return writeRole(user, (session) =>
                accessService.revokeRole(id, DEPLOYMENT_TENANT_ID, 'tenant', context, session)
            ).then((saved) => {
                accessService.auditRoleRevoked(context, id, held, DEPLOYMENT_TENANT_ID, 'tenant');
                return generateSuccess(saved, 200);
            });
        });
    });
