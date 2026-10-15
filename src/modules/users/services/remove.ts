/**
 * @module
 * Soft and hard delete, restore, and the erasure cascade a hard delete runs.
 */

import type { ClientSession } from 'mongoose';
import { t } from '@infrastructure/i18n';
import {
    generateSuccess,
    generateReject,
    type ResponseSuccess,
    type ResponseReject
} from '@infrastructure/http/response';
import { imageStore } from '@infrastructure/adapters/image-store';
import { withTransaction } from '@infrastructure/runtime/database';
import { recordAudit } from '@infrastructure/observability/audit';
import type { CallerContext } from '@types';
import { logger } from '@infrastructure/adapters/logger';
import type { AfterErase } from '@kernel/registry';
import { roleProtectedRefusal } from '@modules/access';
import type { UserDocument } from '../model';
import { userRepository } from '../repository';
import { personalDataErasers } from '../erasure-registry';
import { usersAuditActions } from '../audit';
import { markSessionsEnded } from './credentials';

/**
 * Runs every registered `personalData.erase` hook and then deletes the user document
 * itself, all inside `session`'s transaction — cart cleanup, address-book erasure and the rest
 * either all happen or none do, and a crash mid-cascade leaves no half-erased account.
 *
 * Sequential, not `Promise.all`: a `ClientSession` runs ONE operation at a time, and two erasers
 * racing on it fails with a confusing "sharded cluster" error that has nothing to do with
 * sharding.
 *
 * @returns the work the erasers asked to run once this commits
 */
const runErasureCascade = async (
    user: UserDocument,
    session: ClientSession
): Promise<AfterErase[]> => {
    const deferred: AfterErase[] = [];
    for (const erase of personalDataErasers()) {
        const afterErase = await erase(user.id, session);
        if (afterErase) deferred.push(afterErase);
    }
    await userRepository.deleteOne(user, session);
    return deferred;
};

/**
 * Runs the work the erasers deferred, once the transaction has committed.
 *
 * Never rejects: the account is already gone, so a failure here cannot become a failed erasure.
 * Each one is caught alone, so a failing step does not skip the ones after it; the log is the only
 * signal a human gets.
 *
 * @param userId - the erased account, for the log line
 * @param deferred - what the erasers returned
 */
const runAfterErase = (userId: string, deferred: readonly AfterErase[]): Promise<void> =>
    Promise.all(
        deferred.map((afterErase) =>
            afterErase().catch((error: unknown) => {
                // Stryker disable all
                logger.error({ message: 'Post-erasure step failed.', userId, error });
                // Stryker restore all
            })
        )
    ).then(() => undefined);

/**
 * Remove a user document (soft or hard delete). Soft delete stamps `deletedAt` once;
 * `restoreById` undoes it. A hard delete runs the erasure cascade, `access`'s hook included, so
 * every membership the account holds (a tenant seat AND a platform one) goes in the same
 * transaction as the row. Only the hard path does, since a soft delete is a restore waiting to
 * happen.
 *
 * @param context - who did this. Absent for a caller with no request behind it that also has no
 * stake in the trail (a test, a script's dry run). Present and `caller.system` for the inactivity
 * reaper, which records `SYSTEM_USER_SOFT_DELETED`/`SYSTEM_USER_ERASED` rather than an `admin.*`
 * action — nobody was at the keyboard. Present and NOT `caller.system` for the admin
 * `DELETE /users(/:id)` route, which records `ADMIN_USER_SOFT_DELETED`/`ADMIN_USER_ERASED`.
 */
export const remove = (
    user: UserDocument,
    hardDelete = false,
    context?: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> => {
    if (hardDelete)
        return withTransaction((session) => runErasureCascade(user, session))
            .then((deferred) => runAfterErase(user.id, deferred))
            .then(() => imageStore.remove(user.imageUrl))
            .then(() => {
                recordAudit(context, {
                    action: context?.caller.system
                        ? usersAuditActions.SYSTEM_USER_ERASED
                        : usersAuditActions.ADMIN_USER_ERASED,
                    outcome: 'success',
                    targetType: 'user',
                    targetId: user.id,
                    metadata: { hardDelete: true }
                });
            })
            .then(() => generateSuccess(undefined, 200, t('users.hard-deleted')));

    // Already deleted: nothing to do. DELETE must be safe to retry; undoing it is `restoreById`.
    if (user.deletedAt) return Promise.resolve(generateSuccess(user, 200, t('users.soft-deleted')));

    user.deletedAt = new Date();
    // The epoch moves in the same save, so a restore does not bring the old tokens back.
    markSessionsEnded(user);
    // Only the reaper's own soft delete may later be hard-deleted by it.
    if (context?.caller.system) user.deletedBy = 'reaper';
    return userRepository.save(user).then((saved) => {
        recordAudit(context, {
            action: context?.caller.system
                ? usersAuditActions.SYSTEM_USER_SOFT_DELETED
                : usersAuditActions.ADMIN_USER_SOFT_DELETED,
            outcome: 'success',
            targetType: 'user',
            targetId: user.id,
            metadata: { hardDelete: false }
        });
        return generateSuccess(saved, 200, t('users.soft-deleted'));
    });
};

/**
 * Undo a soft delete. The account's sessions stay revoked: the owner logs in again.
 *
 * @param id - the user to restore
 * @param context - the caller: records `ADMIN_USER_RESTORED`, and is judged against the account
 * @returns the restored user; 404 when there is none, 403 `ROLE_MANAGEMENT_REQUIRED` when the
 *   account holds a staff role the caller may not manage, 409 when it is not soft-deleted
 */
export const restoreById = (
    id: string,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        return roleProtectedRefusal(context, id).then((refusal) => {
            if (refusal) return refusal;
            if (!user.deletedAt) return generateReject(409, [t('users.not-deleted')]);
            user.deletedAt = undefined;
            user.deletedBy = undefined;
            return userRepository.save(user).then((saved) => {
                recordAudit(context, {
                    action: usersAuditActions.ADMIN_USER_RESTORED,
                    outcome: 'success',
                    targetType: 'user',
                    targetId: id
                });
                return generateSuccess(saved, 200, t('users.restored'));
            });
        });
    });

/**
 * Remove a user by ID (soft or hard delete). Fetches the document, refuses a staff account the
 * caller may not manage, then delegates to remove().
 * @param context - the caller: forwarded to {@link remove} for the audit row, and judged by {@link roleProtectedRefusal}
 */
export const removeById = (
    id: string,
    hardDelete = false,
    context: CallerContext
): Promise<ResponseSuccess<UserDocument> | ResponseSuccess<undefined> | ResponseReject> =>
    userRepository.findById(id).then((user) => {
        if (!user) return generateReject(404, [t('users.not-found')]);

        return roleProtectedRefusal(context, id).then(
            (refusal) => refusal ?? remove(user, hardDelete, context)
        );
    });
